import os
import shutil
import subprocess
from datetime import datetime
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from database import get_db, DATABASE_URL
from models import User
from auth import require_superadmin
from activity import log_activity

router = APIRouter(prefix="/api/backup", tags=["backup"])

BACKUP_DIR = os.path.join(os.path.dirname(__file__), "..", "backups")
os.makedirs(BACKUP_DIR, exist_ok=True)

IS_POSTGRES = DATABASE_URL.startswith("postgres")


def _db_file_path() -> str:
    """SQLite-only: path to the .db file on disk."""
    if DATABASE_URL.startswith("sqlite"):
        return DATABASE_URL.replace("sqlite:///", "")
    return ""


def _pg_conn_parts():
    """Parse DATABASE_URL into pieces pg_dump/pg_restore need, passed via
    env vars (not argv) so the password never shows up in `ps`/logs."""
    parsed = urlparse(DATABASE_URL.replace("postgresql+psycopg2", "postgresql"))
    return {
        "host": parsed.hostname,
        "port": str(parsed.port or 5432),
        "user": parsed.username,
        "password": parsed.password or "",
        "dbname": (parsed.path or "/").lstrip("/"),
    }


def _create_backup_file() -> str:
    """Core backup logic, usable both from the API endpoint and the
    background scheduler (which has no request/auth context)."""
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

    if IS_POSTGRES:
        parts = _pg_conn_parts()
        filename = f"backup_{timestamp}.dump"
        dest = os.path.join(BACKUP_DIR, filename)
        env = {**os.environ, "PGPASSWORD": parts["password"]}
        cmd = [
            "pg_dump", "-h", parts["host"], "-p", parts["port"], "-U", parts["user"],
            "-Fc", "-f", dest, parts["dbname"],
        ]
        result = subprocess.run(cmd, env=env, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"pg_dump failed: {result.stderr[-2000:]}")
    else:
        db_path = _db_file_path()
        if not db_path or not os.path.exists(db_path):
            raise RuntimeError("No SQLite database file found to back up")
        filename = f"backup_{timestamp}.db"
        shutil.copy(db_path, os.path.join(BACKUP_DIR, filename))

    return filename


def _prune_old_backups(keep: int = 14):
    """Keep only the most recent `keep` automatic backups so disk usage
    doesn't grow unbounded. Manually uploaded files are left alone."""
    autos = sorted(
        (f for f in os.listdir(BACKUP_DIR) if f.startswith("backup_")),
        reverse=True,
    )
    for stale in autos[keep:]:
        try:
            os.remove(os.path.join(BACKUP_DIR, stale))
        except OSError:
            pass


async def run_scheduled_backups(interval_hours: float = 24):
    """Background loop started at app startup: takes a full-database backup
    on a fixed interval, independent of any admin remembering to click
    'create backup'. This is the actual safety net for data loss — the
    manual endpoints below are for on-demand snapshots (e.g. before a risky
    migration) and disaster recovery."""
    import asyncio
    while True:
        try:
            filename = _create_backup_file()
            _prune_old_backups()
            print(f"[backup] scheduled backup created: {filename}")
        except Exception as e:
            print(f"[backup] scheduled backup FAILED: {e}")
        await asyncio.sleep(interval_hours * 3600)


@router.post("/create")
def create_backup(db: Session = Depends(get_db), superadmin: User = Depends(require_superadmin)):
    """Superadmin-only: this backs up the ENTIRE shared database (every
    tenant), so it's not exposed to account admins — a per-tenant admin
    should use the account export/delete flow in routers/accounts.py
    instead, which only touches their own account's data."""
    try:
        filename = _create_backup_file()
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    log_activity(db, superadmin.username, "backup_create", f"Created backup {filename}")
    return {"filename": filename, "created_at": filename}


@router.get("/list")
def list_backups(superadmin: User = Depends(require_superadmin)):
    files = sorted(os.listdir(BACKUP_DIR), reverse=True)
    files = [f for f in files if os.path.isfile(os.path.join(BACKUP_DIR, f))]
    return [{"filename": f, "size_kb": round(os.path.getsize(os.path.join(BACKUP_DIR, f)) / 1024, 1)} for f in files]


@router.post("/restore/{filename}")
def restore_backup(filename: str, confirm: bool = False, db: Session = Depends(get_db),
                    superadmin: User = Depends(require_superadmin)):
    """Superadmin-only: restores the WHOLE database, overwriting current
    data for every tenant. Requires confirm=true to guard against an
    accidental one-line API call wiping production."""
    src = os.path.join(BACKUP_DIR, filename)
    if not os.path.exists(src):
        raise HTTPException(status_code=404, detail="Backup not found")
    if not confirm:
        raise HTTPException(
            status_code=400,
            detail="This overwrites the entire live database for all tenants. "
                   "Re-send with ?confirm=true to proceed.",
        )

    if IS_POSTGRES:
        if not filename.endswith(".dump"):
            raise HTTPException(status_code=400, detail="This backup file isn't a Postgres dump")
        parts = _pg_conn_parts()
        env = {**os.environ, "PGPASSWORD": parts["password"]}
        cmd = [
            "pg_restore", "-h", parts["host"], "-p", parts["port"], "-U", parts["user"],
            "-d", parts["dbname"], "--clean", "--if-exists", "--no-owner", src,
        ]
        result = subprocess.run(cmd, env=env, capture_output=True, text=True)
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"pg_restore failed: {result.stderr[-2000:]}")
    else:
        db_path = _db_file_path()
        if not db_path:
            raise HTTPException(status_code=400, detail="No SQLite database configured to restore into")
        shutil.copy(src, db_path)

    log_activity(db, superadmin.username, "backup_restore", f"Restored backup {filename}")
    return {"detail": f"Restored from {filename}. Restart the server to apply."}


@router.post("/upload")
async def upload_backup(file: UploadFile = File(...), superadmin: User = Depends(require_superadmin),
                         db: Session = Depends(get_db)):
    dest = os.path.join(BACKUP_DIR, file.filename)
    content = await file.read()
    with open(dest, "wb") as f:
        f.write(content)
    log_activity(db, superadmin.username, "backup_upload", f"Uploaded backup {file.filename}")
    return {"detail": "Backup uploaded", "filename": file.filename}


@router.delete("/{filename}")
def delete_backup(filename: str, superadmin: User = Depends(require_superadmin), db: Session = Depends(get_db)):
    path = os.path.join(BACKUP_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Backup not found")
    os.remove(path)
    log_activity(db, superadmin.username, "backup_delete", f"Deleted backup {filename}")
    return {"detail": "Backup deleted"}
