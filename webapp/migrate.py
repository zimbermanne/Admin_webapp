"""
Tiny self-healing schema migration.

Base.metadata.create_all() only creates tables that don't exist yet — it never
ALTERs existing tables to add new columns. Since the database persists across
deploys, every time a model gains a new column we'd otherwise get
`UndefinedColumn` errors on a live table. This module inspects the actual DB
schema at startup and adds any columns the models define but the table is
missing, so deploys self-heal instead of crash-looping.

For anything beyond simple "add a nullable/defaulted column" (renames, type
changes, dropping columns), switch to Alembic — this is intentionally minimal.
"""
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

# table_name -> list of (column_name, DDL type, default SQL literal or None)
_MIGRATIONS = {
    "users": [
        ("is_demo", "BOOLEAN", "false"),
    ],
}

# Postgres enum type name -> list of values the model expects it to contain.
# create_all() never alters an enum type that already exists, so if a model
# adds a new enum member (e.g. RoleEnum.superadmin) the DB-side type must be
# extended by hand or every insert of the new value crash-loops with
# `InvalidTextRepresentation: invalid input value for enum ...`.
_ENUM_MIGRATIONS = {
    "roleenum": ["superadmin", "admin", "manager", "employee"],
}


def _run_enum_migrations(engine: Engine):
    """Add any enum values the models define but the DB type is missing.

    `ALTER TYPE ... ADD VALUE` cannot run inside a multi-statement
    transaction block on Postgres, so this uses its own autocommit
    connection rather than sharing the transactional connection used for
    column migrations below.
    """
    if engine.dialect.name != "postgresql":
        return  # enum ALTER syntax below is Postgres-specific

    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        for enum_name, values in _ENUM_MIGRATIONS.items():
            rows = conn.execute(
                text(
                    "SELECT e.enumlabel FROM pg_type t "
                    "JOIN pg_enum e ON t.oid = e.enumtypid "
                    "WHERE t.typname = :enum_name"
                ),
                {"enum_name": enum_name},
            ).fetchall()

            if not rows:
                continue  # type doesn't exist yet; create_all() will create it fresh

            existing_values = {r[0] for r in rows}
            for value in values:
                if value in existing_values:
                    continue
                conn.execute(text(f"ALTER TYPE {enum_name} ADD VALUE IF NOT EXISTS '{value}'"))
                print(f"[migrate] added missing enum value {enum_name}.{value}")


def run_migrations(engine: Engine):
    _run_enum_migrations(engine)

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as conn:
        for table, columns in _MIGRATIONS.items():
            if table not in existing_tables:
                continue  # create_all() will create it fresh with all columns
            existing_cols = {c["name"] for c in inspector.get_columns(table)}
            for col_name, col_type, default in columns:
                if col_name in existing_cols:
                    continue
                default_clause = f" DEFAULT {default}" if default is not None else ""
                ddl = f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}{default_clause}"
                conn.execute(text(ddl))
                print(f"[migrate] added missing column {table}.{col_name}")
