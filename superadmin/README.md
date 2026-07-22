# Moneytracer Superadmin Console

A standalone static page (no build step) for platform-level administration —
separate from the tenant-facing React app in `/frontend`.

## Deploying it

It's a single `index.html` with everything inlined. Host it anywhere that
serves static files: a separate Railway static site, Netlify, Vercel, GitHub
Pages, or even just opening the file locally over `file://` for occasional use.

On first load it asks for:
- **Backend API URL** — your deployed Moneytracer API, e.g.
  `https://moneytracer-production.up.railway.app`
- **Tenant app URL** — the regular tenant-facing app, used to build the
  "Login as" link, e.g. `https://app.zimbermanne.co.tz`

Both are stored only in that browser's `localStorage` — nothing is baked into
the file at build time, so the same `index.html` works against any environment
(staging vs production) just by changing these two values.

## What it talks to

All backend support lives in the main API under two routers:

- `routers/accounts.py` — per-tenant CRUD (list/view/suspend/activate/delete),
  already existed before this console.
- `routers/superadmin.py` — cross-account diagnostics: `/api/superadmin/stats`,
  `/api/superadmin/activity` (the CRITICAL:-tagged cross-tenant feed), and
  `/api/superadmin/health`. New — added alongside this console.
- `POST /api/auth/impersonate/{user_id}` (in `routers/auth.py`) — issues a
  30-minute token to log in as a tenant user for support purposes. Can't
  target another superadmin or an inactive user; every use is logged to the
  target account's own activity log, not just a superadmin-side log.

Only a user with `role == "superadmin"` can log into this console or call any
of the above — the login screen rejects any other role client-side, and every
endpoint enforces it server-side regardless.
