from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from decimal import Decimal
from sqlalchemy.orm import Session

from core.security import get_current_user, require_permission, require_roles
from core.database import get_db
from models.product import Category, Product
from models.order import OrderItem
from models.store import Store
from schemas.product import CategoryCreate, CategoryOut, ProductOut

router = APIRouter(prefix="/products", tags=["Products"])


@router.post("/categories", response_model=CategoryOut, dependencies=[Depends(require_permission("seller:manage_products"))])
def create_category(payload: CategoryCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    category = Category(name=payload.name)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return db.query(Category).all()


PRODUCT_IMAGE_DIR = Path(__file__).resolve().parents[1] / "product_img"
ALLOWED_IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


@router.post("/", response_model=ProductOut, dependencies=[Depends(require_permission("seller:manage_products"))])
def create_product(
    name: str = Form(...),
    description: str | None = Form(None),
    price: Decimal = Form(..., gt=0),
    stock: int = Form(0, ge=0),
    category_id: int | None = Form(None),
    store_id: int | None = Form(None),
    image: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if user.role and user.role.name == "admin":
        store = db.query(Store).filter(Store.id == store_id).first() if store_id else db.query(Store).first()
    else:
        store = db.query(Store).filter(Store.owner_id == user.id).first()
    if not store:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Select or create a store before adding products")

    image_url = None
    if image and image.filename:
        extension = ALLOWED_IMAGE_TYPES.get(image.content_type or "")
        if not extension:
            raise HTTPException(status_code=400, detail="Only JPG, PNG and WEBP images are supported")
        PRODUCT_IMAGE_DIR.mkdir(exist_ok=True)
        filename = f"{uuid4().hex}{extension}"
        (PRODUCT_IMAGE_DIR / filename).write_bytes(image.file.read())
        image_url = f"/product-img/{filename}"

    product = Product(
        name=name,
        description=description,
        image_url=image_url,
        price=price,
        stock=stock,
        category_id=category_id,
        store_id=store.id,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.put("/{product_id}", response_model=ProductOut, dependencies=[Depends(require_roles("admin"))])
def update_product(
    product_id: int,
    name: str = Form(...),
    description: str | None = Form(None),
    price: Decimal = Form(..., gt=0),
    stock: int = Form(0, ge=0),
    category_id: int | None = Form(None),
    image: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    product.name = name
    product.description = description
    product.price = price
    product.stock = stock
    product.category_id = category_id
    if image and image.filename:
        extension = ALLOWED_IMAGE_TYPES.get(image.content_type or "")
        if not extension:
            raise HTTPException(status_code=400, detail="Only JPG, PNG and WEBP images are supported")
        PRODUCT_IMAGE_DIR.mkdir(exist_ok=True)
        filename = f"{uuid4().hex}{extension}"
        (PRODUCT_IMAGE_DIR / filename).write_bytes(image.file.read())
        if product.image_url:
            old_file = PRODUCT_IMAGE_DIR / Path(product.image_url).name
            if old_file.exists():
                old_file.unlink()
        product.image_url = f"/product-img/{filename}"

    db.commit()
    db.refresh(product)
    return product


@router.delete("/{product_id}", status_code=204, dependencies=[Depends(require_roles("admin"))])
def delete_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if db.query(OrderItem).filter(OrderItem.product_id == product_id).first():
        raise HTTPException(status_code=400, detail="This product has order history and cannot be deleted")
    if product.image_url:
        image_file = PRODUCT_IMAGE_DIR / Path(product.image_url).name
        if image_file.exists():
            image_file.unlink()
    db.delete(product)
    db.commit()
    return None


@router.get("/", response_model=list[ProductOut])
def list_products(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return db.query(Product).all()


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product
