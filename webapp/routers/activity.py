from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models import ActivityLog, User, RoleEnum
from schemas import ActivityOut
from auth import require_manager_up, get_current_user
from activity import log_activity_for_user

router = APIRouter(prefix="/api/activity", tags=["activity"])


def get_account_filter(current_user: User):
    """Return account_id filter for queries. Superadmin gets None (no filter)."""
    if current_user.role == RoleEnum.superadmin:
        return None
    if not current_user.account_id:
        raise HTTPException(status_code=403, detail="User must belong to an account")
    return current_user.account_id


ALLOWED_CLIENT_ACTIONS = {"pos_mode_switch", "logout"}


class ClientEventIn(BaseModel):
    action: str
    details: str = ""


@router.post("/log")
def log_client_event(payload: ClientEventIn, db: Session = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    """Lets the frontend record specific whitelisted staff actions (e.g. switching
    POS pricing mode) so admins can audit who changed what and when."""
    if payload.action not in ALLOWED_CLIENT_ACTIONS:
        raise HTTPException(status_code=400, detail="Unrecognized action")
    log_activity_for_user(db, current_user, payload.action, payload.details)
    return {"detail": "logged"}


@router.get("/", response_model=List[ActivityOut])
def list_activity(limit: int = 100, db: Session = Depends(get_db),
                   current_user: User = Depends(require_manager_up)):
    query = db.query(ActivityLog)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(ActivityLog.account_id == account_id)
    return query.order_by(ActivityLog.created_at.desc()).limit(limit).all()


@router.get("/stats")
def activity_stats(db: Session = Depends(get_db), current_user: User = Depends(require_manager_up)):
    query = db.query(ActivityLog)
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(ActivityLog.account_id == account_id)
    logs = query.all()
    by_user = {}
    by_action = {}
    for log in logs:
        by_user[log.username] = by_user.get(log.username, 0) + 1
        by_action[log.action] = by_action.get(log.action, 0) + 1
    return {"total_events": len(logs), "by_user": by_user, "by_action": by_action}
