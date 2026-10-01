from decimal import Decimal

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from config import settings
from core.database import get_db
from core.security import get_current_user
from models.order import Order
from models.payment import Payment
from models.product import Product
from models.user import User
from schemas.order import PaymentOut

stripe.api_key = settings.STRIPE_SECRET_KEY

router = APIRouter(prefix="/payments", tags=["Payments"])


def get_order_for_user(order_id: int, db: Session, user: User) -> Order:
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.user_id != user.id and (not user.role or user.role.name != "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    return order


@router.post("/checkout/{order_id}")
def create_checkout_session(
    order_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    order = get_order_for_user(order_id, db, user)
    if order.status == "paid":
        raise HTTPException(status_code=400, detail="Order is already paid")

    existing_payment = (
        db.query(Payment)
        .filter(Payment.order_id == order.id, Payment.status == "pending")
        .first()
    )
    if existing_payment and existing_payment.stripe_session_id:
        try:
            session = stripe.checkout.Session.retrieve(existing_payment.stripe_session_id)
            if session.status == "open":
                return {"checkout_url": session.url, "payment_id": existing_payment.id}
        except stripe.error.StripeError:
            pass

    currency = settings.STRIPE_CURRENCY.lower()
    line_items = []
    for item in order.items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")
        amount = int((Decimal(str(product.price)) * 100).quantize(Decimal("1")))
        line_items.append(
            {
                "price_data": {
                    "currency": currency,
                    "product_data": {"name": product.name},
                    "unit_amount": amount,
                },
                "quantity": item.quantity,
            }
        )

    payment = existing_payment or Payment(
        order_id=order.id,
        amount=int((Decimal(str(order.total_amount)) * 100).quantize(Decimal("1"))),
        currency=currency,
        status="pending",
    )
    if existing_payment is None:
        db.add(payment)
        db.flush()

    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            line_items=line_items,
            metadata={"order_id": str(order.id), "payment_id": str(payment.id)},
            success_url=f"{settings.FRONTEND_URL}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{settings.FRONTEND_URL}/payment/cancelled?order_id={order.id}",
        )
    except stripe.error.StripeError as exc:
        db.rollback()
        raise HTTPException(status_code=502, detail="Stripe checkout could not be created") from exc

    payment.stripe_session_id = session.id
    db.commit()
    db.refresh(payment)
    return {"checkout_url": session.url, "payment_id": payment.id}


@router.get("/{payment_id}", response_model=PaymentOut)
def get_payment(payment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if payment.order.user_id != user.id and (not user.role or user.role.name != "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    return payment


@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    if not settings.STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="Stripe webhook secret is not configured")

    payload = await request.body()
    signature = request.headers.get("stripe-signature")
    try:
        event = stripe.Webhook.construct_event(payload, signature, settings.STRIPE_WEBHOOK_SECRET)
    except (ValueError, stripe.error.SignatureVerificationError) as exc:
        raise HTTPException(status_code=400, detail="Invalid Stripe webhook") from exc

    event_type = event["type"]
    session = event["data"]["object"]
    metadata = session.get("metadata", {})
    payment_id = metadata.get("payment_id")
    if payment_id:
        payment = db.query(Payment).filter(Payment.id == int(payment_id)).first()
    else:
        payment = db.query(Payment).filter(Payment.stripe_session_id == session.get("id")).first()

    if payment:
        payment.stripe_payment_intent_id = session.get("payment_intent") or payment.stripe_payment_intent_id
        if event_type == "checkout.session.completed":
            if payment.status != "paid":
                for item in payment.order.items:
                    product = db.query(Product).filter(Product.id == item.product_id).with_for_update().first()
                    if not product:
                        raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")
                    if product.stock < item.quantity:
                        raise HTTPException(status_code=409, detail=f"Not enough stock for {product.name}")
                    product.stock -= item.quantity
                payment.status = "paid"
                payment.order.status = "paid"
        elif event_type in {"checkout.session.expired", "checkout.session.async_payment_failed"}:
            payment.status = "failed"
        db.commit()

    return {"received": True}