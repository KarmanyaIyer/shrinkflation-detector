"""FastAPI application factory."""

import logging
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

from shrinkflation import __version__
from shrinkflation.api.limits import RateLimitMiddleware, limiter
from shrinkflation.api.routes import router as public_router
from shrinkflation.config import get_settings
from shrinkflation.observability import setup_tracing

log = logging.getLogger(__name__)

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
}


def create_app() -> FastAPI:
    settings = get_settings()
    setup_tracing()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    app = FastAPI(
        title="Shrinkflation Detector API",
        version=__version__,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )
    # Middleware added later wraps the earlier ones, so CORS sits outside the rate limiter and
    # 429 responses still carry CORS headers.
    app.add_middleware(RateLimitMiddleware, limiter=limiter)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
        max_age=600,
    )

    @app.middleware("http")
    async def security_headers(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)
        skip_csp = request.url.path.startswith("/api/docs")
        for name, value in SECURITY_HEADERS.items():
            if skip_csp and name == "Content-Security-Policy":
                continue
            response.headers.setdefault(name, value)
        return response

    app.include_router(public_router)

    from shrinkflation.agent.routes import router as agent_router

    app.include_router(agent_router)

    FastAPIInstrumentor.instrument_app(app, excluded_urls="/api/health")
    return app


app = create_app()
