"""Yearly SaaS subscription billing via M-Pesa STK Push (Lipa Na M-Pesa
Online). Distinct from routers/invoices.py, which is customer-facing billing
*within* a tenant's business — this is billing the tenant for platform access
itself.

Flow:
  1. POST /subscribe          (authenticated) — pushes the STK prompt, logs a
                                pending SubscriptionPayment row.
  2. POST /mpesa/callback     (public — Safaricom can't send a Bearer token)
                                — Safaricom reports the result here; on
                                success, extends the account's paid period.
  3. GET  /subscribe/status/{checkout_request_id} (authenticated) — frontend
                                polls this while waiting for the callback.
"""
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

import mpesa
from database import get_db
from models import Account, SubscriptionPayment, PaymentStatus, User
from auth import get_current_user, require_account_user
from activity import log_activity

logger = logging.getLogger("mpesa")

router = APIRouter(prefix="/api/payments", tags=["payments"])

SUBSCRIPTION_FEE_TZS = 20000
SUBSCRIPTION_PERIOD_DAYS = 365


class SubscribeRequest(BaseModel):
    phone: str


class SubscribeResponse(BaseModel):
    checkout_request_id: str
    merchant_request_id: str
    message: str


@router.post("/subscribe", response_model=SubscribeResponse)
def subscribe(
    payload: SubscribeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_account_user),
):
    """Kick off an STK Push for the yearly subscription fee. Any account
    member can trigger this (not just admins) — it's paying to unlock the
    account, not an administrative action."""
    if not current_user.account_id:
        raise HTTPException(status_code=403, detail="User must belong to an account")

    try:
        result = mpesa.initiate_stk_push(
            phone=payload.phone,
            amount=SUBSCRIPTION_FEE_TZS,
            account_reference=f"MT-{current_user.account_id}",
            transaction_desc="MT Subscription",
        )
    except mpesa.MpesaConfigError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except (mpesa.MpesaAPIError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))

    record = SubscriptionPayment(
        account_id=current_user.account_id,
        phone=mpesa.normalize_phone(payload.phone),
        amount=SUBSCRIPTION_FEE_TZS,
        merchant_request_id=result.get("MerchantRequestID"),
        checkout_request_id=result.get("CheckoutRequestID"),
        status=PaymentStatus.pending,
        initiated_by=current_user.username,
    )
    db.add(record)
    log_activity(db, current_user.username, "subscription_stk_push",
                 f"STK push sent to {record.phone} for TZS {SUBSCRIPTION_FEE_TZS:,}",
                 account_id=current_user.account_id)

    return SubscribeResponse(
        checkout_request_id=result.get("CheckoutRequestID", ""),
        merchant_request_id=result.get("MerchantRequestID", ""),
        message="Check your phone and enter your M-Pesa PIN to complete payment.",
    )


@router.get("/subscribe/status/{checkout_request_id}")
def subscribe_status(
    checkout_request_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_account_user),
):
    """Frontend polls this after /subscribe while waiting for the callback
    (typically a few seconds). Scoped to the caller's own account so one
    tenant can't probe another's payment records."""
    record = (
        db.query(SubscriptionPayment)
        .filter(
            SubscriptionPayment.checkout_request_id == checkout_request_id,
            SubscriptionPayment.account_id == current_user.account_id,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Payment record not found")
    return {
        "status": record.status.value,
        "mpesa_receipt": record.mpesa_receipt,
        "result_desc": record.result_desc,
    }


@router.post("/mpesa/callback")
async def mpesa_callback(request: Request, db: Session = Depends(get_db)):
    """Public endpoint — Safaricom POSTs the STK Push result here. No auth is
    possible on this route (Safaricom doesn't send your app's Bearer token),
    so nothing here trusts the request beyond matching a CheckoutRequestID we
    already issued ourselves in /subscribe. Always return ResultCode 0 to
    Safaricom regardless of what we found, per Daraja's integration guide —
    a non-zero/error HTTP response just causes pointless retries on their side.
    """
    body = await request.json()
    logger.info("M-Pesa callback received: %s", body)

    try:
        stk_callback = body["Body"]["stkCallback"]
        checkout_request_id = stk_callback["CheckoutRequestID"]
        result_code = stk_callback["ResultCode"]
        result_desc = stk_callback.get("ResultDesc", "")
    except (KeyError, TypeError):
        logger.warning("Malformed M-Pesa callback payload: %s", body)
        return {"ResultCode": 0, "ResultDesc": "Accepted"}

    record = (
        db.query(SubscriptionPayment)
        .filter(SubscriptionPayment.checkout_request_id == checkout_request_id)
        .first()
    )
    if not record:
        logger.warning("M-Pesa callback for unknown CheckoutRequestID: %s", checkout_request_id)
        return {"ResultCode": 0, "ResultDesc": "Accepted"}

    # Already processed (Safaricom can retry callbacks) — don't extend the
    # subscription twice for one payment.
    if record.status != PaymentStatus.pending:
        return {"ResultCode": 0, "ResultDesc": "Accepted"}

    record.result_desc = result_desc

    if result_code == 0:
        # Successful payment — line items are key/value pairs, pull the receipt.
        items = stk_callback.get("CallbackMetadata", {}).get("Item", [])
        meta = {i.get("Name"): i.get("Value") for i in items}
        record.mpesa_receipt = str(meta.get("MpesaReceiptNumber", ""))
        record.status = PaymentStatus.success

        account = db.query(Account).filter(Account.id == record.account_id).first()
        if account:
            # Extend from "now" or from the current expiry if it's still in
            # the future (renewing before expiry adds on top rather than
            # resetting to a shorter total period).
            base = account.subscription_expires_at
            if not base or base < datetime.utcnow():
                base = datetime.utcnow()
            account.subscription_expires_at = base + timedelta(days=SUBSCRIPTION_PERIOD_DAYS)
            account.plan = "paid"

        log_activity(db, "mpesa", "subscription_paid",
                     f"Receipt {record.mpesa_receipt} — account upgraded to paid",
                     account_id=record.account_id)
    else:
        # User cancelled, entered wrong PIN, timed out, insufficient funds, etc.
        record.status = PaymentStatus.failed
        log_activity(db, "mpesa", "subscription_payment_failed",
                     result_desc, account_id=record.account_id)

    db.commit()
    return {"ResultCode": 0, "ResultDesc": "Accepted"}
