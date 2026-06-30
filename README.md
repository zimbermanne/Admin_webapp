# Zimbermanne Retail OS — v2.5 Scaffold

This project was generated from `README2_5.md`. It implements the **"Currently Working (v2.5)"**
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

### 3. Production deployment (Railway, or any host where frontend/backend are separate services)

The dev server's `/api` proxy (in `vite.config.js`) only exists while running `vite dev` —
it is **not** part of the production build. If you deploy the frontend as a static site
(e.g. on its own Railway service) separately from the FastAPI backend, you must tell the
frontend where the backend lives at **build time**, otherwise `/api/*` requests will hit the
frontend's own host and fail (you'll see a generic "Registration failed" / "Login failed"
instead of a real error, because the response isn't JSON).

Set `VITE_API_URL` to your backend's public URL before building:

```bash
VITE_API_URL=https://your-backend-service.up.railway.app npm run build
```

On Railway, add `VITE_API_URL` as a **build-time** environment variable on the frontend
service (Settings → Variables), pointing at the backend service's public domain, then
redeploy. Also make sure the backend's `ALLOWED_ORIGINS` env var includes the frontend's
URL so CORS doesn't block the requests.


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
