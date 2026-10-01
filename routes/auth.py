from fastapi import APIRouter, Depends, Form, HTTPException, status
from sqlalchemy.orm import Session

from core.security import create_access_token, ensure_default_roles, get_current_user, hash_password, verify_password
from core.database import get_db
from models.role import Role
from models.user import User
from schemas.user import UserCreate, UserOut

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/register", response_model=UserOut)
def register_user(payload: UserCreate, db: Session = Depends(get_db)):
    ensure_default_roles(db)

    if db.query(User).filter((User.username == payload.username) | (User.email == payload.email)).first():
        raise HTTPException(status_code=400, detail="User already exists")

    buyer_role = db.query(Role).filter(Role.name == "buyer").first()
    user = User(
        username=payload.username,
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        role_id=buyer_role.id if buyer_role else None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login")
def login_user(
    email: str = Form(..., json_schema_extra={"example": ""}),
    password: str = Form(..., json_schema_extra={"example": ""}),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    token = create_access_token({"user_id": user.id})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user)):
    return user
