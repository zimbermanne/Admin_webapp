from sqlalchemy.orm import Session
from models import ActivityLog, User


def log_activity(db: Session, username: str, action: str, details: str = "", account_id: int = None):
    """Log an activity with optional account_id for multi-tenant scoping."""
    entry = ActivityLog(username=username, action=action, details=details, account_id=account_id)
    db.add(entry)
    db.commit()


def log_activity_for_user(db: Session, user: User, action: str, details: str = ""):
    """Log an activity for a specific user, automatically using their account_id."""
    account_id = user.account_id if user.account_id else None
    log_activity(db, user.username, action, details, account_id)
