from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class OrderItemBase(BaseModel):
    product_id: int
    quantity: int = Field(default=1, ge=1)


class OrderItemCreate(OrderItemBase):
    pass


class OrderItemOut(OrderItemBase):
    id: int
    order_id: int
    price: Decimal

    model_config = ConfigDict(from_attributes=True)


class OrderBase(BaseModel):
    store_id: int
    status: str = "pending"


class OrderCreate(OrderBase):
    items: list[OrderItemCreate] = Field(min_length=1)


class OrderOut(OrderBase):
    id: int
    user_id: int
    total_amount: Decimal
    items: list[OrderItemOut] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class PaymentOut(BaseModel):
    id: int
    order_id: int
    stripe_session_id: str | None = None
    stripe_payment_intent_id: str | None = None
    amount: int
    currency: str
    status: str

    model_config = ConfigDict(from_attributes=True)
