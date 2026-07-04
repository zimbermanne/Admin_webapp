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
    "accounts": [
        # Existing accounts predate the onboarding wizard, so they default to
        # "already onboarded" and are never interrupted by it. Freshly
        # registered accounts explicitly set this to False (see routers/auth.py).
        ("onboarding_completed", "BOOLEAN", "true"),
        # Existing accounts predate the business/community split — they're all
        # businesses (that's all that existed before this feature).
        ("account_type", "VARCHAR(20)", "'business'"),
        # Soft-delete support: existing accounts are all live/not pending
        # deletion, so both default to NULL (no default clause needed).
        ("pending_deletion_at", "TIMESTAMP", None),
        ("deleted_at", "TIMESTAMP", None),
        # Country/currency picker added to the onboarding wizard — existing
        # accounts predate it, so both default to empty until an admin fills
        # them in via the Settings page.
        ("country", "VARCHAR(80)", "''"),
        ("currency", "VARCHAR(10)", "''"),
        # True only once an admin explicitly saves country/currency (whether
        # newly onboarding or confirming a backfilled default). Drives the
        # "please confirm your country" dashboard nudge for legacy accounts.
        ("country_confirmed", "BOOLEAN", "false"),
    ],
}


def run_migrations(engine: Engine):
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as conn:
        for table, columns in _MIGRATIONS.items():
            if table not in existing_tables:
                continue  # create_all() will create it fresh with all columns
            existing_cols = {c["name"] for c in inspector.get_columns(table)}
            country_col_is_new = "country" not in existing_cols
            for col_name, col_type, default in columns:
                if col_name in existing_cols:
                    continue
                default_clause = f" DEFAULT {default}" if default is not None else ""
                ddl = f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}{default_clause}"
                conn.execute(text(ddl))
                print(f"[migrate] added missing column {table}.{col_name}")

            # One-time backfill: this whole app predates the country/currency
            # picker and has only ever been deployed for Tanzania (the demo
            # account, COMPANY_ADDRESS, and CURRENCY env var all default to
            # Tanzania/TZS) — so existing accounts get that as a sensible
            # starting value rather than being left blank. Admins can change
            # it any time in Settings; the dashboard nudges them to confirm.
            if table == "accounts" and country_col_is_new:
                conn.execute(text(
                    "UPDATE accounts SET country = 'Tanzania', currency = 'TZS' "
                    "WHERE (country IS NULL OR country = '')"
                ))
                print("[migrate] backfilled existing accounts with country=Tanzania, currency=TZS")
