"""Per-client request limits and anonymous visitor identity.

Fixed window counters per client address, kept in process memory. The API runs as a single
replica, so this is enough to stop one client from monopolizing the model budget or the
database. It is not a substitute for network level protection.
"""

import hashlib
import threading
import time
from dataclasses import dataclass

from fastapi import Request
from starlette.datastructures import MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

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


@dataclass(frozen=True)
class Rule:
    name: str
    method: str | None
    path: str | None
    limit: int
    window_seconds: int


@dataclass(frozen=True)
class Decision:
    allowed: bool
    limit: int
    remaining: int
    reset_after: int


DEFAULT_RULES: tuple[Rule, ...] = (
    Rule("ask", "POST", "/api/ask", 10, 60),
    Rule("default", None, None, 120, 60),
)


class FixedWindowLimiter:
    def __init__(self, rules: tuple[Rule, ...] = DEFAULT_RULES) -> None:
        self.rules = rules
        self._counts: dict[tuple[str, str, int], tuple[int, float]] = {}
        self._lock = threading.Lock()

    def rule_for(self, method: str, path: str) -> Rule:
        for rule in self.rules:
            method_ok = rule.method is None or rule.method == method
            path_ok = rule.path is None or rule.path == path
            if method_ok and path_ok:
                return rule
        return self.rules[-1]

    def hit(self, key: str, method: str, path: str, now: float | None = None) -> Decision:
        now = time.time() if now is None else now
        rule = self.rule_for(method, path)
        window = int(now // rule.window_seconds)
        expires_at = (window + 1) * rule.window_seconds
        bucket = (rule.name, key, window)
        with self._lock:
            count = self._counts.get(bucket, (0, expires_at))[0] + 1
            self._counts[bucket] = (count, expires_at)
            if len(self._counts) > 10_000:
                self._prune(now)
        return Decision(
            allowed=count <= rule.limit,
            limit=rule.limit,
            remaining=max(rule.limit - count, 0),
            reset_after=max(int(expires_at - now), 1),
        )

    def _prune(self, now: float) -> None:
        for bucket, (_, expires_at) in list(self._counts.items()):
            if expires_at <= now:
                del self._counts[bucket]

    def reset(self) -> None:
        with self._lock:
            self._counts.clear()


limiter = FixedWindowLimiter()


class RateLimitMiddleware:
    def __init__(self, app: ASGIApp, limiter: FixedWindowLimiter) -> None:
        self.app = app
        self.limiter = limiter

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request = Request(scope)
        decision = self.limiter.hit(client_ip(request), scope["method"], scope["path"])
        headers = {
            "X-RateLimit-Limit": str(decision.limit),
            "X-RateLimit-Remaining": str(decision.remaining),
            "X-RateLimit-Reset": str(decision.reset_after),
        }
        if not decision.allowed:
            response = JSONResponse(
                status_code=429,
                content={
                    "detail": f"Too many requests. Try again in {decision.reset_after} seconds."
                },
                headers={**headers, "Retry-After": str(decision.reset_after)},
            )
            await response(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                response_headers = MutableHeaders(scope=message)
                for name, value in headers.items():
                    response_headers.append(name, value)
            await send(message)

        await self.app(scope, receive, send_with_headers)
