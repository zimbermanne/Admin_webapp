"""Minimal Safaricom Daraja (M-Pesa) client for Lipa Na M-Pesa Online
(STK Push) — used to collect the yearly SaaS subscription fee.

Env vars required (see .env.example):
    MPESA_ENV               "sandbox" or "production" (default: sandbox)
    MPESA_CONSUMER_KEY
    MPESA_CONSUMER_SECRET
    MPESA_SHORTCODE         Paybill/Till number (sandbox default: 174379)
    MPESA_PASSKEY            Lipa Na M-Pesa passkey for that shortcode
    MPESA_CALLBACK_URL      Public HTTPS URL Safaricom will POST the result to
"""
import base64
import os
import re
import time
from datetime import datetime
from typing import Optional

import httpx

MPESA_ENV = os.getenv("MPESA_ENV", "sandbox")
BASE_URL = (
    "https://api.safaricom.co.ke"
    if MPESA_ENV == "production"
    else "https://sandbox.safaricom.co.ke"
)

CONSUMER_KEY = os.getenv("MPESA_CONSUMER_KEY", "")
CONSUMER_SECRET = os.getenv("MPESA_CONSUMER_SECRET", "")
SHORTCODE = os.getenv("MPESA_SHORTCODE", "174379")
PASSKEY = os.getenv("MPESA_PASSKEY", "")
CALLBACK_URL = os.getenv("MPESA_CALLBACK_URL", "")


class MpesaConfigError(RuntimeError):
    """Raised when required Daraja credentials/config are missing."""


class MpesaAPIError(RuntimeError):
    """Raised when Daraja rejects a request (bad auth, bad payload, etc.)."""


def _require_config():
    missing = [
        name
        for name, val in [
            ("MPESA_CONSUMER_KEY", CONSUMER_KEY),
            ("MPESA_CONSUMER_SECRET", CONSUMER_SECRET),
            ("MPESA_PASSKEY", PASSKEY),
            ("MPESA_CALLBACK_URL", CALLBACK_URL),
        ]
        if not val
    ]
    if missing:
        raise MpesaConfigError(
            f"Missing M-Pesa configuration: {', '.join(missing)}. "
            "Set these in your environment (see .env.example)."
        )


def normalize_phone(phone: str) -> str:
    """Accepts 07XXXXXXXX, +2547XXXXXXXX, 2547XXXXXXXX, 7XXXXXXXX and
    returns Safaricom's required 2547XXXXXXXX / 2541XXXXXXXX format."""
    digits = re.sub(r"\D", "", phone or "")
    if digits.startswith("0") and len(digits) == 10:
        digits = "254" + digits[1:]
    elif digits.startswith("7") or digits.startswith("1"):
        if len(digits) == 9:
            digits = "254" + digits
    if not re.fullmatch(r"254(7|1)\d{8}", digits):
        raise ValueError(f"'{phone}' is not a valid Safaricom number")
    return digits


# Cached in-process; a fresh token is valid ~1 hour on Daraja, so there's no
# need to hit the OAuth endpoint on every push. Not shared across worker
# processes — each gets its own cache, which is fine at this volume.
_token_cache = {"token": None, "expires_at": 0}


def _get_access_token() -> str:
    _require_config()
    now = time.time()
    if _token_cache["token"] and now < _token_cache["expires_at"] - 30:
        return _token_cache["token"]

    creds = base64.b64encode(f"{CONSUMER_KEY}:{CONSUMER_SECRET}".encode()).decode()
    resp = httpx.get(
        f"{BASE_URL}/oauth/v1/generate?grant_type=client_credentials",
        headers={"Authorization": f"Basic {creds}"},
        timeout=15,
    )
    if resp.status_code != 200:
        raise MpesaAPIError(f"Failed to get M-Pesa access token: {resp.status_code} {resp.text}")

    data = resp.json()
    token = data["access_token"]
    _token_cache["token"] = token
    _token_cache["expires_at"] = now + int(data.get("expires_in", 3599))
    return token


def _password_and_timestamp() -> tuple[str, str]:
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    raw = f"{SHORTCODE}{PASSKEY}{timestamp}"
    password = base64.b64encode(raw.encode()).decode()
    return password, timestamp


def initiate_stk_push(
    phone: str,
    amount: int,
    account_reference: str,
    transaction_desc: str = "Subscription payment",
) -> dict:
    """Sends the STK Push prompt to the user's phone. Returns Daraja's
    response dict, which includes MerchantRequestID and CheckoutRequestID —
    store both; CheckoutRequestID is what the callback will reference."""
    _require_config()
    phone = normalize_phone(phone)
    password, timestamp = _password_and_timestamp()
    token = _get_access_token()

    payload = {
        "BusinessShortCode": SHORTCODE,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": "CustomerPayBillOnline",
        "Amount": int(amount),
        "PartyA": phone,
        "PartyB": SHORTCODE,
        "PhoneNumber": phone,
        "CallBackURL": CALLBACK_URL,
        "AccountReference": account_reference[:12],  # Daraja truncates/limits this field
        "TransactionDesc": transaction_desc[:13],
    }
    resp = httpx.post(
        f"{BASE_URL}/mpesa/stkpush/v1/processrequest",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
        timeout=20,
    )
    data = resp.json()
    if resp.status_code != 200 or data.get("ResponseCode") not in ("0", 0):
        raise MpesaAPIError(data.get("errorMessage") or data.get("ResponseDescription") or str(data))
    return data


def query_stk_status(checkout_request_id: str) -> dict:
    """Optional active poll (Daraja also pushes the result via callback, but
    this is useful as a fallback if the callback is delayed/lost)."""
    _require_config()
    password, timestamp = _password_and_timestamp()
    token = _get_access_token()
    payload = {
        "BusinessShortCode": SHORTCODE,
        "Password": password,
        "Timestamp": timestamp,
        "CheckoutRequestID": checkout_request_id,
    }
    resp = httpx.post(
        f"{BASE_URL}/mpesa/stkpushquery/v1/query",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
        timeout=20,
    )
    return resp.json()
