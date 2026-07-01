# Zimbermanne Accounting  — v3.0 Skyscratcher

This project was generated from `README3.0.md`. It implements the **"Currently Working (v3.0)"**
feature set as a working FastAPI backend (`webapp/`) and a React + Vite frontend (`frontend/`),
matching the project structure, sidebar design, and theme described in the README.

## What's included

- **Backend** (`webapp/`): JWT auth with bcrypt, role-based access (Admin/Manager/Employee),
  Inventory CRUD + batch import + low-stock alerts, POS multi-item checkout with stock
  validation, Sales/Purchases/Expenses, Debtors/Creditors ledgers, Reports (P&L, financial
  summary, debtors/creditors, inventory valuation, daily summary), Activity log, Backup
  create/list/restore/upload/delete, and an optional AI agent router (`/api/agent/*`,
  requires `ANTHROPIC_API_KEY`). SQLite is used by default (zero setup); set `DATABASE_URL`
  for PostgreSQL in production.
- **Frontend** (`frontend/`): React + Vite app with the Zoho-style collapsible grouped sidebar
  (light theme, navy/gold/cream tokens), mobile hamburger drawer, JWT login, and pages for
  Dashboard, POS, Inventory, Sales, Purchases, Expenses, Debtors, Creditors, Reports, and
  Settings — all wired to the backend API.

## Quick start

### 1. Backend

```bash
cd webapp
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python init_db.py               # seeds default admin / admin123
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API docs available at `http://localhost:8000/docs`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api/*` to `http://localhost:8000`
(see `vite.config.js`; override with `VITE_API_URL` if your backend runs elsewhere).

Default login: **admin / admin123** — change this immediately after first login
(Settings → Change Password).

## Not yet implemented

The README's **Roadmap (v3.0+)** items — double-entry accounting, invoicing/quotes,
customers/vendors as first-class entities, banking, purchase orders, advanced reports,
documents, notifications, multi-tenant, mobile money webhooks — are scaffolding targets for
the next phase and aren't built here. The `routers/` and `models.py` files are structured so
each of those can be added as its own router + model set, per the README's "What to build"
notes.

## Project layout

```
webapp/      → FastAPI backend (see webapp/README references in main README)
frontend/    → React + Vite frontend
```
