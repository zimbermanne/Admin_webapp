import os
import warnings
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from slowapi.middleware import SlowAPIMiddleware

from database import Base, engine, ensure_schemas
import models  # noqa: F401 ensures models are registered before create_all
from migrate import run_migrations
from rate_limit import limiter
from routers import auth, inventory, sales, purchases, expenses, ledgers, reports, users, activity, backup, agent, invoices, quotations, customers, accounts, reminders, community, personal, public, reference, purchase_orders, superadmin, bank_loans, deadlines, assets
from scheduler import start_scheduler

ensure_schemas(engine)
Base.metadata.create_all(bind=engine)
run_migrations(engine)

app = FastAPI(title="Moneytracer API", version="2.5.0")


@app.on_event("startup")
def _start_background_jobs():
    # Runs in-process — see scheduler.py docstring for the multi-instance caveat.
    start_scheduler()

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

origins_env = os.getenv("ALLOWED_ORIGINS", "*")
allowed_origins = [o.strip() for o in origins_env.split(",")] if origins_env != "*" else ["*"]

# Auth in this app is a Bearer token sent in the Authorization header (see
# auth.py / useAuth.jsx) — never cookies — so the browser doesn't need
# credentialed CORS to make authenticated requests work. Wildcard origins
# combined with allow_credentials=True is a known anti-pattern (and most
# browsers reject that combination outright), so credentials are only
# enabled once specific origins are configured via ALLOWED_ORIGINS.
allow_credentials = allowed_origins != ["*"]
if allowed_origins == ["*"]:
    warnings.warn(
        "ALLOWED_ORIGINS is not set — CORS is wide open (any origin can call "
        "this API). Set ALLOWED_ORIGINS to your actual frontend domain(s) "
        "(comma-separated) in production.",
        RuntimeWarning,
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(inventory.router)
app.include_router(sales.router)
app.include_router(purchases.router)
app.include_router(purchase_orders.router)
app.include_router(expenses.router)
app.include_router(ledgers.router)
app.include_router(reports.router)
app.include_router(users.router)
app.include_router(activity.router)
app.include_router(backup.router)
app.include_router(agent.router)
app.include_router(invoices.router)
app.include_router(quotations.router)
app.include_router(customers.router)
app.include_router(accounts.router)
app.include_router(superadmin.router)
app.include_router(bank_loans.router)
app.include_router(deadlines.router)
app.include_router(assets.router)
app.include_router(reminders.router)
app.include_router(community.router)
app.include_router(personal.router)
app.include_router(public.router)
app.include_router(reference.router)

@app.get("/api/health")
def health():
    return {"status": "ok", "version": "2.5.0"}

# Superadmin console — served same-origin from this same backend, on
# purpose: it's the same API it manages, so there's no cross-origin request
# for it to make, no CORS configuration needed, none of the "Failed to
# fetch" grief that comes from hosting it as a separate origin and trying
# to whitelist that origin via ALLOWED_ORIGINS.
superadmin_static_dir = os.path.join(os.path.dirname(__file__), "superadmin_static")
if os.path.isdir(superadmin_static_dir):
    app.mount("/superadmin", StaticFiles(directory=superadmin_static_dir, html=True), name="superadmin")

# Serve the legacy static SPA shell, if present, at the root
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
