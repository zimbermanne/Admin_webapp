"""Run once (or automatically on startup) to seed the default admin account."""
from database import SessionLocal, Base, engine
from models import User, RoleEnum, Account
from auth import hash_password
from migrate import run_migrations
import sqlalchemy

Base.metadata.create_all(bind=engine)
run_migrations(engine)


def seed():
    db = SessionLocal()
    try:
        # Check if account_id column exists in users table
        try:
            db.execute(sqlalchemy.text("SELECT account_id FROM users LIMIT 1"))
            account_column_exists = True
        except sqlalchemy.exc.ProgrammingError:
            account_column_exists = False
            print("[WARN] account_id column does not exist in users table. Schema needs migration.")
            print("[INFO] Skipping multi-tenant seed. Please run the SQL migration first.")
            # Fallback to old-style seeding for non-migrated databases
            seed_legacy(db)
            return

        # Create superadmin (platform owner)
        if not db.query(User).filter(User.username == "superadmin").first():
            superadmin = User(
                username="superadmin",
                full_name="Platform Superadmin",
                email="superadmin@zimbermanne.co.tz",
                hashed_password=hash_password("superadmin123"),
                role=RoleEnum.superadmin,
                account_id=None,  # Superadmin has no account
            )
            db.add(superadmin)
            db.commit()
            print("[OK] Superadmin created -> username: superadmin, password: superadmin123")
        else:
            print("[INFO] Superadmin already exists, skipping seed.")

        # Create default account for admin
        if not db.query(Account).filter(Account.name == "Default Business").first():
            default_account = Account(
                business_structure="company",
                name="Default Business",
                tin="",
                owner_full_name="System Administrator",
                business_type="retail",
                region="",
                district="",
                street_address="",
                phone="",
                email="admin@zimbermanne.co.tz",
                logo_url="",
                tax_rate=0,
                invoice_prefix="INV",
                payment_terms_days=7,
                is_active=True,
                is_suspended=False,
            )
            db.add(default_account)
            db.commit()
            db.refresh(default_account)
            print(f"[OK] Default account created -> ID: {default_account.id}")
        else:
            default_account = db.query(Account).filter(Account.name == "Default Business").first()
            print("[INFO] Default account already exists, skipping seed.")

        # Create admin user for the default account
        if not db.query(User).filter(User.username == "admin").first():
            admin = User(
                username="admin",
                full_name="System Administrator",
                email="admin@zimbermanne.co.tz",
                hashed_password=hash_password("admin123"),
                role=RoleEnum.admin,
                account_id=default_account.id,
            )
            db.add(admin)
            db.commit()
            print("[OK] Default admin created -> username: admin, password: admin123")
        else:
            print("[INFO] Admin user already exists, skipping seed.")

        # Create demo account and user
        if not db.query(Account).filter(Account.name == "Demo Business").first():
            demo_account = Account(
                business_structure="company",
                name="Demo Business",
                tin="",
                owner_full_name="Demo Owner",
                business_type="retail",
                region="",
                district="",
                street_address="",
                phone="+255123456789",
                email="demo@zimbermanne.co.tz",
                logo_url="",
                tax_rate=0,
                invoice_prefix="INV",
                payment_terms_days=7,
                is_active=True,
                is_suspended=False,
            )
            db.add(demo_account)
            db.commit()
            db.refresh(demo_account)
            print(f"[OK] Demo account created -> ID: {demo_account.id}")
        else:
            demo_account = db.query(Account).filter(Account.name == "Demo Business").first()
            print("[INFO] Demo account already exists, skipping seed.")

        if not db.query(User).filter(User.username == "demo").first():
            import uuid
            demo = User(
                username="demo",
                full_name="Demo User",
                email="demo@zimbermanne.co.tz",
                hashed_password=hash_password(uuid.uuid4().hex),  # unused, unguessable
                role=RoleEnum.manager,
                is_demo=True,
                account_id=demo_account.id,
            )
            db.add(demo)
            db.commit()
            print("[OK] Demo account created -> use POST /api/auth/demo-login (no password needed)")
        else:
            print("[INFO] Demo account already exists, skipping seed.")
    finally:
        db.close()


def seed_legacy(db):
    """Legacy seeding for databases that haven't been migrated to multi-tenant yet."""
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
        print("[OK] Default admin created (legacy mode) -> username: admin, password: admin123")
    else:
        print("[INFO] Admin user already exists, skipping seed.")

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
        print("[OK] Demo account created (legacy mode) -> use POST /api/auth/demo-login (no password needed)")
    else:
        print("[INFO] Demo account already exists, skipping seed.")


if __name__ == "__main__":
    seed()
