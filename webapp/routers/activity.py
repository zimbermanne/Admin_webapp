from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import ActivityLog, User, RoleEnum
from schemas import ActivityOut
from auth import require_manager_up

router = APIRouter(prefix="/api/activity", tags=["activity"])


def get_account_filter(current_user: User):
    """Return account_id filter for queries. Superadmin gets None (no filter)."""
    if current_user.role == RoleEnum.superadmin:
        return None
    if not current_user.account_id:
        raise HTTPException(status_code=403, detail="User must belong to an account")
    return current_user.account_id


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
