# syntax=docker/dockerfile:1
# Build stage installs dependencies and the project into /app/.venv with uv.
# Runtime stage is a plain Python image with that virtualenv, no uv, non-root user.
# One image serves the API (default command) and runs `shrink migrate` and `shrink refresh`.
#
# Versioned uv images track Debian trixie; the bookworm variants stopped at uv 0.9.x.
# The runtime base must be the same Debian release and Python minor as the builder.
FROM ghcr.io/astral-sh/uv:0.12.10-python3.13-trixie-slim AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0

WORKDIR /app

# Dependencies only, cached until pyproject.toml or uv.lock changes.
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-dev --no-install-project

COPY pyproject.toml uv.lock README.md alembic.ini ./
COPY alembic ./alembic
COPY src ./src
# Non-editable so the runtime stage does not need /app/src.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-editable

FROM python:3.13-slim-trixie

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.venv/bin:$PATH"

RUN useradd --uid 10001 --user-group --create-home --shell /usr/sbin/nologin app

WORKDIR /app
# Owned by root on purpose: the app user can run the code but not change it.
COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/alembic /app/alembic
COPY --from=builder /app/alembic.ini /app/alembic.ini

USER app
EXPOSE 8000
CMD ["uvicorn", "shrinkflation.api.app:app", "--host", "0.0.0.0", "--port", "8000", "--no-server-header"]
