# Agent instructions

Read README.md first. This file covers conventions that are not obvious from the code.

## Style

- Plain, concise prose in code comments, docs, and commit messages. No jokes, metaphors,
  em dashes, or filler. Comments explain why, not what.
- Commit messages: one short imperative line describing what changed. No attribution trailers.
- Never commit `.env` or any credential. `.env.example` lists every variable.

## Commands

Backend (run in `backend/`):

```bash
uv run ruff check . && uv run ruff format --check .
uv run pyright
uv run pytest -q
uv run shrink --help
```

Frontend (run in `frontend/`):

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm generate-api-types   # needs the API running on :8000
```

## Rules the code depends on

- Retailer values (description, size text, prices) are stored and displayed unaltered. Parsed
  quantities live in `size_parses` and never overwrite the source text.
- A new `snapshots` row is written only when size text, regular price, or description changes.
  Unchanged observations extend `last_seen_at` and `observations` on the latest snapshot.
- `changes` rows are only published when both parses are comparable, above the confidence
  threshold, and the size change is plausible. Everything else is `needs_review` or `hidden`.
- Every LLM call goes through `LlmClient.chat` so it is traced, priced, and counted against the
  daily cap. Do not call the OpenAI SDK directly elsewhere.
- Agent tools are read only and validate arguments with Pydantic before touching the database.
