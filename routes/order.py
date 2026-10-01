from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from core.security import get_current_user
from core.database import get_db
from models.order import Order, OrderItem
from models.product import Product
from models.store import Store
from models.user import User
from schemas.order import OrderCreate, OrderOut

router = APIRouter(prefix="/orders", tags=["Orders"])


@router.post("/", response_model=OrderOut)
def create_order(payload: OrderCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    store = db.query(Store).filter(Store.id == payload.store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    total = 0.0
    for item in payload.items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")
        if product.store_id != payload.store_id:
            raise HTTPException(status_code=400, detail=f"Product {item.product_id} belongs to another store")
        if product.stock < item.quantity:
            raise HTTPException(status_code=400, detail=f"Not enough stock for {product.name}")
        total += float(product.price) * item.quantity

    order = Order(user_id=user.id, store_id=payload.store_id, total_amount=total, status="pending")
    db.add(order)
    db.commit()
    db.refresh(order)

    for item in payload.items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        order_item = OrderItem(order_id=order.id, product_id=item.product_id, quantity=item.quantity, price=float(product.price))
        db.add(order_item)
        db.commit()

    return order


@router.get("/", response_model=list[OrderOut])
def list_orders(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role and user.role.name == "admin":
        return db.query(Order).all()
    return db.query(Order).filter(Order.user_id == user.id).all()
