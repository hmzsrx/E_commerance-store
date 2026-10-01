from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from core.security import get_current_user, require_permission
from core.database import get_db
from models.store import Store
from models.user import User
from schemas.store import StoreCreate, StoreOut

router = APIRouter(prefix="/stores", tags=["Stores"])


@router.post("/", response_model=StoreOut, dependencies=[Depends(require_permission("seller:manage_products"))])
def create_store(payload: StoreCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    store = Store(name=payload.name, description=payload.description, owner_id=user.id)
    db.add(store)
    db.commit()
    db.refresh(store)
    return store


@router.get("/", response_model=list[StoreOut])
def list_stores(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(Store).all()


@router.get("/{store_id}", response_model=StoreOut)
def get_store(store_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    store = db.query(Store).filter(Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return store
