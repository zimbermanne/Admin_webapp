"""Small SMTP helper used to email invoice/quotation PDFs to customers.

Configure via environment variables:
  SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASSWORD,
  SMTP_FROM (defaults to SMTP_USER), SMTP_USE_TLS (default "true")

If SMTP_HOST/SMTP_USER/SMTP_PASSWORD aren't set, send_email_with_attachment
raises a RuntimeError with a clear message — callers turn that into a 400.
"""
import os
import smtplib
from email.message import EmailMessage

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER)
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() != "false"


def is_configured() -> bool:
    return bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD)


def send_email_with_attachment(to_email: str, subject: str, body: str,
                                attachment_bytes: bytes, attachment_filename: str):
    if not is_configured():
        raise RuntimeError(
            "Email sending isn't configured yet. Set SMTP_HOST, SMTP_USER and "
            "SMTP_PASSWORD (and optionally SMTP_PORT, SMTP_FROM) on the backend."
        )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = to_email
    msg.set_content(body)
    msg.add_attachment(attachment_bytes, maintype="application", subtype="pdf",
                        filename=attachment_filename)

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as server:
        if SMTP_USE_TLS:
            server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg)


def send_plain_email(to_email: str, subject: str, body: str):
    """Like send_email_with_attachment, but for notifications (e.g. overdue
    invoice reminders) that have no PDF to attach."""
    if not is_configured():
        raise RuntimeError(
            "Email sending isn't configured yet. Set SMTP_HOST, SMTP_USER and "
            "SMTP_PASSWORD (and optionally SMTP_PORT, SMTP_FROM) on the backend."
        )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = to_email
    msg.set_content(body)

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as server:
        if SMTP_USE_TLS:
            server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg)
