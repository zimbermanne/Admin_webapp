"""Run once (or automatically on startup) to seed the default admin account."""
from database import SessionLocal, Base, engine
from models import User, RoleEnum
from auth import hash_password

Base.metadata.create_all(bind=engine)


def seed():
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.username == "admin").first():
            admin = User(
                username="admin",
                full_name="System Administrator",
                email="admin@zimbermanne.co.tz",
                hashed_password=hash_password("admin123"),
                role=RoleEnum.admin,
            )
            db.add(admin)
            db.commit()
            print("Default admin created -> username: admin, password: admin123")
        else:
            print("Admin user already exists, skipping seed.")

        if not db.query(User).filter(User.username == "demo").first():
            import uuid
            demo = User(
                username="demo",
                full_name="Demo User",
                email="demo@zimbermanne.co.tz",
                hashed_password=hash_password(uuid.uuid4().hex),  # unused, unguessable
                role=RoleEnum.manager,
                is_demo=True,
            )
            db.add(demo)
            db.commit()
            print("Demo account created -> use POST /api/auth/demo-login (no password needed)")
        else:
            print("Demo account already exists, skipping seed.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
