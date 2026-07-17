import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import Base, engine
import models  # noqa: F401 ensures models are registered before create_all
from migrate import run_migrations
from routers import auth, inventory, sales, purchases, expenses, ledgers, reports, users, activity, backup, agent, invoices, quotations, customers, accounts, reminders, community, personal

Base.metadata.create_all(bind=engine)
run_migrations(engine)

app = FastAPI(title="Moneytracer API", version="2.5.0")

origins_env = os.getenv("ALLOWED_ORIGINS", "*")
allowed_origins = [o.strip() for o in origins_env.split(",")] if origins_env != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(inventory.router)
app.include_router(sales.router)
app.include_router(purchases.router)
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
app.include_router(reminders.router)
app.include_router(community.router)
<<<<<<< HEAD
=======
app.include_router(personal.router)
>>>>>>> b6fd16de9e989850adace1f71efc5fe14448477d


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "2.5.0"}


# Serve the legacy static SPA shell, if present, at the root
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
