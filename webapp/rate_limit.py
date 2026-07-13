from slowapi import Limiter
from slowapi.util import get_remote_address

# Shared across main.py (for the app-level exception handler + middleware)
# and any router that wants to rate-limit specific endpoints (e.g. login,
# password reset) against brute-force / credential-stuffing attempts.
limiter = Limiter(key_func=get_remote_address)
