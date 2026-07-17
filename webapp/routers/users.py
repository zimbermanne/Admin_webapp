from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import User, RoleEnum
from schemas import UserOut, UserUpdate, UserCreate, AdminPasswordReset
from auth import require_manager_up, require_admin, hash_password, get_current_user
from activity import log_activity_for_user

router = APIRouter(prefix="/api/users", tags=["users"])


def get_account_filter(current_user: User):
    """Return account_id filter for queries. Superadmin gets None (no filter)."""
    if current_user.role == RoleEnum.superadmin:
        return None
    if not current_user.account_id:
        raise HTTPException(status_code=403, detail="User must belong to an account")
    return current_user.account_id


@router.get("/", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db), current_user: User = Depends(require_manager_up)):
    query = db.query(User).filter(User.is_demo == False)  # noqa: E712
    account_id = get_account_filter(current_user)
    if account_id is not None:
        query = query.filter(User.account_id == account_id)
    return query.order_by(User.username).all()


@router.post("/", response_model=UserOut)
def create_user(payload: UserCreate, db: Session = Depends(get_db),
                admin: User = Depends(require_admin)):
    """Admin creates a staff account directly (no self-registration required)."""
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(400, "Username already exists")
    
    account_id = get_account_filter(admin)
    if account_id is None:
        raise HTTPException(status_code=403, detail="Superadmin cannot create users")
    
    user = User(
        username=payload.username,
        full_name=payload.full_name or "",
        email=payload.email or "",
        hashed_password=hash_password(payload.password),
        role=payload.role or RoleEnum.employee,
        account_id=account_id,
    )
    db.add(user); db.commit(); db.refresh(user)
    log_activity_for_user(db, admin, "user_create", f"Admin created user {user.username} ({user.role.value})")
    return user


@router.put("/{username}", response_model=UserOut)
def update_user(username: str, payload: UserUpdate, db: Session = Depends(get_db),
                admin: User = Depends(require_admin)):
    query = db.query(User).filter(User.username == username)
    account_id = get_account_filter(admin)
    if account_id is not None:
        query = query.filter(User.account_id == account_id)
    user = query.first()
    if not user: raise HTTPException(404, "User not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit(); db.refresh(user)
    log_activity_for_user(db, admin, "user_update", f"Updated user {username}")
    return user


@router.post("/{username}/reset-password")
def admin_reset_password(username: str, payload: AdminPasswordReset,
                          db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    query = db.query(User).filter(User.username == username)
    account_id = get_account_filter(admin)
    if account_id is not None:
        query = query.filter(User.account_id == account_id)
    user = query.first()
    if not user: raise HTTPException(404, "User not found")
    if user.is_demo: raise HTTPException(403, "Cannot reset demo account password")
    user.hashed_password = hash_password(payload.new_password)
    db.commit()
    log_activity_for_user(db, admin, "admin_reset_password", f"Reset password for {username}")
    return {"detail": f"Password reset for {username}"}


@router.delete("/{username}")
def delete_user(username: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    query = db.query(User).filter(User.username == username)
    account_id = get_account_filter(admin)
    if account_id is not None:
        query = query.filter(User.account_id == account_id)
    user = query.first()
    if not user: raise HTTPException(404, "User not found")
    if user.username == admin.username: raise HTTPException(400, "Cannot delete your own account")
    db.delete(user); db.commit()
    log_activity_for_user(db, admin, "user_delete", f"Deleted user {username}")
    return {"detail": "User deleted"}
