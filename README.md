# Shrinkflation Detector

Tracks package size and price for 1,000+ grocery products at one Kroger store and publishes
the ones that quietly shrank, with before and after evidence.

## How it works

- A daily job reads every tracked product from the Kroger Public API and stores a snapshot only
  when the size text, price, or description changes. Unchanged products extend the last snapshot.
- Size text such as `12 x 12 fl oz` or `1/2 gal` is normalized to a base quantity. Deterministic
  rules handle most labels. The rest go to DeepSeek V4 Flash (open weights, MIT) in JSON mode,
  validated against a Pydantic schema, with one repair retry and escalation to V4 Pro when the
  parse is low confidence. Parses are cached by label text.
- Consecutive snapshots are compared and classified: shrink, grow, price increase, price
  decrease, relabel. Small differences below a noise threshold are ignored, and implausible or
  low confidence transitions go to a review queue instead of the public feed.
- FastAPI serves the feed, product histories, search, and stats. `POST /api/ask` runs a
  tool-calling agent that answers questions with read-only tools over the same database.
- Every request and every LLM call is traced with OpenTelemetry. LLM calls are also logged with
  token counts, cache hits, cost, and trace ids. Public traffic is rate limited per IP. The agent
  has a per-visitor daily question budget and a global daily spend cap.

## Stack

Python 3.13, FastAPI, SQLAlchemy 2, Alembic, Postgres 17, Pydantic v2, OpenTelemetry,
DeepSeek API (OpenAI compatible), React 19, TypeScript, Vite, Docker, GitHub Actions,
Azure Container Apps.

## Local setup

```bash
cp .env.example .env    # fill in DEEPSEEK_API_KEY, KROGER_CLIENT_ID, KROGER_CLIENT_SECRET, KROGER_LOCATION_ID
docker compose up -d postgres jaeger
cd backend
uv sync
uv run shrink migrate
uv run shrink build-basket --target 1200
uv run shrink refresh
uv run uvicorn shrinkflation.api.app:app --reload
```

```bash
cd frontend
pnpm install
pnpm dev
```

Traces are at http://localhost:16686 (Jaeger). API docs are at http://localhost:8000/api/docs.

## Layout

- `backend/` Python package `shrinkflation`: `kroger/` API client, `sizes/` size parser,
  `pipeline/` basket build, refresh, and change detection, `api/` public endpoints,
  `agent/` tool-calling question endpoint, `llm/` DeepSeek client with cost tracking.
- `frontend/` React site: feed, product pages, ask.
- `docker-compose.yml` Postgres and Jaeger for local development, plus `api` and `pipeline`
  services under the `app` profile.

## Data notes

Product data comes from the Kroger Public API (Products and Locations) for a single store.
Names, size text, and prices are shown as returned by the API. Prices are regular shelf prices,
not promotions. This is an independent project and is not affiliated with Kroger.

## License

MIT
