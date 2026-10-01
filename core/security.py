import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from config import settings
from core.database import get_db
from models.role import Role
from models.user import User

bearer_scheme = HTTPBearer()


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    pw_bytes = password.encode("utf-8")
    derived = hashlib.pbkdf2_hmac("sha256", pw_bytes, salt, 100_000)
    return salt.hex() + ":" + derived.hex()


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash or ":" not in password_hash:
        return False
    salt_hex, derived_hex = password_hash.split(":", 1)
    salt = bytes.fromhex(salt_hex)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return hmac.compare_digest(derived.hex(), derived_hex)


def create_access_token(subject: dict[str, Any]) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"exp": expire, "sub": str(subject["user_id"])}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        token = token.strip().strip('"')
        if token.lower().startswith("bearer "):
            token = token[7:].strip()
        return jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_sub": False},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    payload = decode_access_token(credentials.credentials)
    subject = payload.get("sub")
    if isinstance(subject, dict):
        user_id = subject.get("user_id")
    else:
        try:
            user_id = int(subject)
        except (TypeError, ValueError):
            user_id = None
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user


def require_roles(*allowed_roles: str):
    def dependency(user: User = Depends(get_current_user)) -> User:
        if not user.role:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Role not assigned")
        if user.role.name not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
        return user

    return dependency


def require_permission(permission_name: str):
    def dependency(user: User = Depends(get_current_user)) -> User:
        role = user.role
        if not role:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No role assigned")

        permissions = {item.strip().lower() for item in (role.permissions or "").split(",") if item.strip()}
        if permission_name.lower() in permissions or "admin:all" in permissions:
            return user
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    return dependency


def ensure_default_roles(db: Session) -> None:
    for name, permissions in {
        "admin": "admin:all,seller:manage_products,buyer:read_products",
        "seller": "seller:manage_products,buyer:read_products",
        "buyer": "buyer:read_products",
    }.items():
        role = db.query(Role).filter(Role.name == name).first()
        if not role:
            db.add(Role(name=name, permissions=permissions))
    db.commit()
