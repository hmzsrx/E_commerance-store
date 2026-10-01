from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routes.auth import router as auth_router
from routes.order import router as order_router
from routes.payment import router as payment_router
from routes.product import router as product_router
from routes.role import router as role_router
from routes.store import router as store_router
from routes.user import router as user_router

app = FastAPI(title="E-Commerce Platform", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

project_root = Path(__file__).resolve().parent
product_img_dir = project_root / "product_img"
product_img_dir.mkdir(exist_ok=True)
app.mount("/product-img", StaticFiles(directory=str(product_img_dir)), name="product-img")


@app.get('/ping')
def ping():
    return {'message': 'pong'}


app.include_router(auth_router)
app.include_router(user_router)
app.include_router(store_router)
app.include_router(product_router)
app.include_router(order_router)
app.include_router(payment_router)
app.include_router(role_router)

