import os
import shutil
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database import get_db, DATABASE_URL
from models import User
from auth import require_admin
from activity import log_activity

router = APIRouter(prefix="/api/backup", tags=["backup"])

BACKUP_DIR = os.path.join(os.path.dirname(__file__), "..", "backups")
os.makedirs(BACKUP_DIR, exist_ok=True)


def _db_file_path() -> str:
    if DATABASE_URL.startswith("sqlite"):
        return DATABASE_URL.replace("sqlite:///", "")
    return ""


@router.post("/create")
def create_backup(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    db_path = _db_file_path()
    if not db_path or not os.path.exists(db_path):
        raise HTTPException(status_code=400, detail="Backups only supported for SQLite in this build")
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"backup_{timestamp}.db"
    shutil.copy(db_path, os.path.join(BACKUP_DIR, filename))
    log_activity(db, admin.username, "backup_create", f"Created backup {filename}")
    return {"filename": filename, "created_at": timestamp}


@router.get("/list")
def list_backups(admin: User = Depends(require_admin)):
    files = sorted(os.listdir(BACKUP_DIR), reverse=True)
    return [{"filename": f, "size_kb": round(os.path.getsize(os.path.join(BACKUP_DIR, f)) / 1024, 1)} for f in files]


@router.post("/restore/{filename}")
def restore_backup(filename: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    src = os.path.join(BACKUP_DIR, filename)
    if not os.path.exists(src):
        raise HTTPException(status_code=404, detail="Backup not found")
    db_path = _db_file_path()
    if not db_path:
        raise HTTPException(status_code=400, detail="Restore only supported for SQLite in this build")
    shutil.copy(src, db_path)
    log_activity(db, admin.username, "backup_restore", f"Restored backup {filename}")
    return {"detail": f"Restored from {filename}. Restart the server to apply."}


@router.post("/upload")
async def upload_backup(file: UploadFile = File(...), admin: User = Depends(require_admin),
                         db: Session = Depends(get_db)):
    dest = os.path.join(BACKUP_DIR, file.filename)
    content = await file.read()
    with open(dest, "wb") as f:
        f.write(content)
    log_activity(db, admin.username, "backup_upload", f"Uploaded backup {file.filename}")
    return {"detail": "Backup uploaded", "filename": file.filename}


@router.delete("/{filename}")
def delete_backup(filename: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    path = os.path.join(BACKUP_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Backup not found")
    os.remove(path)
    log_activity(db, admin.username, "backup_delete", f"Deleted backup {filename}")
    return {"detail": "Backup deleted"}
