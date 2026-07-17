import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./moneytracer.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# SQLite (used for local dev / tests) doesn't support Postgres-style schemas
# the same way, so schema separation only applies when running on Postgres.
# Account/User/ActivityLog stay in the default schema (shared identity across
# all three tracks); each track's own domain tables live in their own schema
# so a business-track query can never accidentally touch community or
# personal data, and vice versa.
USE_SCHEMAS = not DATABASE_URL.startswith("sqlite")

SCHEMA_BUSINESS = "business"
SCHEMA_COMMUNITY = "community"
SCHEMA_PERSONAL = "personal"


def schema_args(schema_name: str) -> dict:
    """Table-level schema assignment, a no-op under SQLite."""
    return {"schema": schema_name} if USE_SCHEMAS else {}


def fk_ref(table_dot_column: str, schema_name: str) -> str:
    """Schema-qualified ForeignKey target for references *within* the same
    non-default schema (e.g. Sale.item_id -> InventoryItem.id, both in the
    'business' schema). Once a table has a non-default schema, SQLAlchemy
    needs the schema prefix to resolve the FK target — a bare 'accounts.id'
    still works unqualified since Account stays in the default/public schema."""
    return f"{schema_name}.{table_dot_column}" if USE_SCHEMAS else table_dot_column


def ensure_schemas(engine):
    """Create the per-track Postgres schemas if they don't exist yet.
    Must run before Base.metadata.create_all(), since Postgres won't create
    tables in a schema that doesn't exist."""
    if not USE_SCHEMAS:
        return
    with engine.begin() as conn:
        for schema in (SCHEMA_BUSINESS, SCHEMA_COMMUNITY, SCHEMA_PERSONAL):
            conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema}"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
