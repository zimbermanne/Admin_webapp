"""Asset tracking — house, vehicle, equipment, or other. A flat value
tracker for v1: no depreciation schedule, estimated_value is whatever the
owner last set it to. Shared by business and personal account types alike.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Asset, User, RoleEnum, AssetCategory
from schemas import AssetCreate, AssetUpdate, AssetOut
from auth import get_current_user, require_manager_up
from activity import log_activity_for_user

router = APIRouter(prefix="/api/assets", tags=["assets"])


def get_account_filter(current_user: User):
    if current_user.role == RoleEnum.superadmin:
        return None
    if not current_user.account_id:
        raise HTTPException(status_code=403, detail="User must belong to an account")
    return current_user.account_id


@router.get("/", response_model=List[AssetOut])
def list_assets(category: Optional[AssetCategory] = None, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)):
    account_id = get_account_filter(current_user)
    q = db.query(Asset)
    if account_id is not None:
        q = q.filter(Asset.account_id == account_id)
    if category is not None:
        q = q.filter(Asset.category == category)
    return q.order_by(Asset.created_at.desc()).all()


@router.post("/", response_model=AssetOut)
def create_asset(payload: AssetCreate, db: Session = Depends(get_db),
                  current_user: User = Depends(require_manager_up)):
    account_id = get_account_filter(current_user)
    if account_id is None:
        raise HTTPException(status_code=403, detail="Superadmin cannot create assets")

    asset = Asset(
        account_id=account_id,
        name=payload.name,
        category=payload.category,
        estimated_value=payload.estimated_value,
        acquired_date=payload.acquired_date,
        notes=payload.notes or "",
        created_by=current_user.username,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    log_activity_for_user(db, current_user, "asset_create", f"Added asset: {asset.name}")
    return asset


@router.put("/{asset_id}", response_model=AssetOut)
def update_asset(asset_id: int, payload: AssetUpdate, db: Session = Depends(get_db),
                  current_user: User = Depends(require_manager_up)):
    account_id = get_account_filter(current_user)
    q = db.query(Asset).filter(Asset.id == asset_id)
    if account_id is not None:
        q = q.filter(Asset.account_id == account_id)
    asset = q.first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(asset, field, value)
    db.commit()
    db.refresh(asset)
    log_activity_for_user(db, current_user, "asset_update", f"Updated asset {asset_id}")
    return asset


@router.delete("/{asset_id}")
def delete_asset(asset_id: int, db: Session = Depends(get_db),
                  current_user: User = Depends(require_manager_up)):
    account_id = get_account_filter(current_user)
    q = db.query(Asset).filter(Asset.id == asset_id)
    if account_id is not None:
        q = q.filter(Asset.account_id == account_id)
    asset = q.first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    db.delete(asset)
    db.commit()
    log_activity_for_user(db, current_user, "asset_delete", f"Deleted asset {asset_id}")
    return {"detail": "Asset deleted"}
