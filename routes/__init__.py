from .auth import router as auth_router
from .order import router as order_router
from .product import router as product_router
from .role import router as role_router
from .store import router as store_router
from .user import router as user_router

__all__ = [
    "auth_router",
    "user_router",
    "store_router",
    "product_router",
    "order_router",
    "role_router",
]
