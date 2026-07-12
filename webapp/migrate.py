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
# These tables live in the default/public schema.
_MIGRATIONS = {
    "users": [
        ("is_demo", "BOOLEAN", "false"),
    ],
    "accounts": [
        # Existing accounts predate the onboarding wizard, so they default to
        # "already onboarded" and are never interrupted by it. Freshly
        # registered accounts explicitly set this to False (see routers/auth.py).
        ("onboarding_completed", "BOOLEAN", "true"),
        # Existing accounts predate the business/community split — they're all
        # businesses (that's all that existed before this feature).
        ("account_type", "VARCHAR(20)", "'business'"),
    ],
}

# (schema, table) -> list of (column_name, DDL type, default SQL literal or None)
# These tables live in the per-track Postgres schema (a no-op filter under
# SQLite, where everything is unqualified — see database.USE_SCHEMAS).
_SCHEMA_MIGRATIONS = {
    ("business", "sales"): [
        # Snapshot of the item's cost at time of sale, so historical gross
        # margin doesn't silently shift when the item's current cost changes.
        ("cost_price_at_sale", "FLOAT", None),
    ],
    ("business", "purchases"): [
        # Proper FK to inventory instead of relying solely on name-matching.
        ("item_id", "INTEGER", None),
    ],
}


def run_migrations(engine: Engine):
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    is_sqlite = engine.dialect.name == "sqlite"

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

        for (schema, table), columns in _SCHEMA_MIGRATIONS.items():
            # SQLite has no real schemas; its tables were created unqualified.
            effective_schema = None if is_sqlite else schema
            schema_tables = set(inspector.get_table_names(schema=effective_schema))
            if table not in schema_tables:
                continue
            existing_cols = {c["name"] for c in inspector.get_columns(table, schema=effective_schema)}
            qualified_table = table if effective_schema is None else f"{effective_schema}.{table}"
            for col_name, col_type, default in columns:
                if col_name in existing_cols:
                    continue
                default_clause = f" DEFAULT {default}" if default is not None else ""
                ddl = f"ALTER TABLE {qualified_table} ADD COLUMN {col_name} {col_type}{default_clause}"
                conn.execute(text(ddl))
                print(f"[migrate] added missing column {qualified_table}.{col_name}")
