from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.security import get_current_user, require_roles
from core.database import get_db
from models.role import Role
from models.user import User

router = APIRouter(prefix="/roles", tags=["Roles"])


@router.get("/")
def list_roles(db: Session = Depends(get_db), user: User = Depends(require_roles("admin"))):
    return db.query(Role).all()


@router.post("/")
def create_role(name: str, permissions: str, db: Session = Depends(get_db), user: User = Depends(require_roles("admin"))):
    if db.query(Role).filter(Role.name == name).first():
        raise HTTPException(status_code=400, detail="Role already exists")
    role = Role(name=name, permissions=permissions)
    db.add(role)
    db.commit()
    db.refresh(role)
    return role
