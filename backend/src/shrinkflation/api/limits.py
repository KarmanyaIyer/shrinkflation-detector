"""Request rate limits and anonymous visitor identity."""

import hashlib

from fastapi import Request
from slowapi import Limiter

from shrinkflation.config import get_settings


def client_ip(request: Request) -> str:
    """Client address, honoring the first X-Forwarded-For hop set by the ingress."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def visitor_key(request: Request) -> str:
    """Salted hash of the client address. The address itself is never stored."""
    salt = get_settings().visitor_hash_salt
    return hashlib.sha256(f"{salt}:{client_ip(request)}".encode()).hexdigest()[:32]


limiter = Limiter(key_func=client_ip, default_limits=["120/minute"], headers_enabled=True)
