from getpass import getpass

from core.database import SessionLocal
from core.security import ensure_default_roles, hash_password
from models import Role, User


def main() -> None:
    username = input("Admin username: ").strip()
    email = input("Admin email: ").strip()
    full_name = input("Admin full name (optional): ").strip() or None
    password = getpass("Admin password: ")
    password_confirmation = getpass("Confirm password: ")

    if not username or not email or not password:
        raise SystemExit("Username, email and password are required.")
    if password != password_confirmation:
        raise SystemExit("Passwords do not match.")

    db = SessionLocal()
    try:
        ensure_default_roles(db)
        admin_role = db.query(Role).filter(Role.name == "admin").first()
        if admin_role is None:
            raise SystemExit("Admin role could not be created.")

        user = db.query(User).filter(
            (User.username == username) | (User.email == email)
        ).first()

        if user is None:
            user = User(
                username=username,
                email=email,
                full_name=full_name,
                password_hash=hash_password(password),
                role_id=admin_role.id,
                is_active=True,
            )
            db.add(user)
            message = "Admin user created."
        else:
            user.role_id = admin_role.id
            user.password_hash = hash_password(password)
            user.is_active = True
            if full_name:
                user.full_name = full_name
            message = "Existing user promoted to admin."

        db.commit()
        print(message)
    finally:
        db.close()


if __name__ == "__main__":
    main()