"""POST /api/ask: the public question endpoint with per-visitor daily budgets."""

import logging
from datetime import UTC, date, datetime
from functools import lru_cache
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from shrinkflation.agent.service import AgentAnswer, answer_question
from shrinkflation.api.limits import visitor_key
from shrinkflation.config import get_settings
from shrinkflation.db.models import AskLog, VisitorBudget
from shrinkflation.db.session import get_db, session_scope
from shrinkflation.llm.client import LlmBudgetExceeded, LlmClient

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["agent"])
DbSession = Annotated[Session, Depends(get_db)]


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=400)


class ToolCallOut(BaseModel):
    name: str
    arguments: dict[str, Any]
    ms: int
    ok: bool


class AskResponse(BaseModel):
    answer: str
    tool_calls: list[ToolCallOut]
    model: str
    total_tokens: int
    latency_ms: int
    questions_remaining: int
    trace_id: str | None = None


class BudgetOut(BaseModel):
    questions_per_day: int
    questions_remaining: int


@lru_cache
def get_llm() -> LlmClient:
    return LlmClient()


def _today() -> date:
    return datetime.now(UTC).date()


def _consume_question(key: str) -> int:
    """Count one question against today's budget and return the new count.

    A single atomic upsert, committed before the model runs, so concurrent requests from one
    visitor cannot slip past the limit together. Counts above the limit are rejected requests
    and are never refunded.
    """
    statement = (
        pg_insert(VisitorBudget)
        .values(visitor_key=key, day=_today(), questions_used=1, tokens_used=0)
        .on_conflict_do_update(
            index_elements=[VisitorBudget.visitor_key, VisitorBudget.day],
            set_={"questions_used": VisitorBudget.questions_used + 1},
        )
        .returning(VisitorBudget.questions_used)
    )
    with session_scope() as session:
        return session.execute(statement).scalar_one()


def _start_log(key: str, question: str) -> int:
    """Write the pending ask_log row in its own transaction so it survives whatever follows."""
    with session_scope() as session:
        entry = AskLog(visitor_key=key, question=question, status="pending")
        session.add(entry)
        session.flush()
        return entry.id


def _finish_log(
    log_id: int, key: str, *, status: str, result: AgentAnswer | None = None, refund: bool = False
) -> int:
    """Record the outcome and budget adjustments in their own committed transaction.

    Raising an HTTPException rolls back the request session, so failure outcomes written
    there would be lost. Returns the visitor's question count for the response.
    """
    with session_scope() as session:
        entry = session.get(AskLog, log_id)
        if entry is not None:
            entry.status = status
            if result is not None:
                entry.answer = result.answer
                entry.tool_calls = [
                    {"name": t.name, "arguments": t.arguments, "ms": t.ms, "ok": t.ok}
                    for t in result.tool_calls
                ]
                entry.model = result.model
                entry.total_tokens = result.total_tokens
                entry.latency_ms = result.latency_ms
                entry.trace_id = result.trace_id
        budget = session.execute(
            select(VisitorBudget)
            .where(VisitorBudget.visitor_key == key, VisitorBudget.day == _today())
            .with_for_update()
        ).scalar_one_or_none()
        if budget is None:
            return 0
        if refund and budget.questions_used > 0:
            budget.questions_used -= 1
        if result is not None:
            budget.tokens_used += result.total_tokens
        return budget.questions_used


@router.get("/ask/budget", response_model=BudgetOut)
def ask_budget(request: Request, db: DbSession) -> BudgetOut:
    settings = get_settings()
    used = db.execute(
        select(VisitorBudget.questions_used).where(
            VisitorBudget.visitor_key == visitor_key(request), VisitorBudget.day == _today()
        )
    ).scalar_one_or_none()
    return BudgetOut(
        questions_per_day=settings.ask_questions_per_visitor_per_day,
        questions_remaining=max(settings.ask_questions_per_visitor_per_day - (used or 0), 0),
    )


@router.post("/ask", response_model=AskResponse)
def ask(request: Request, payload: AskRequest) -> AskResponse:
    settings = get_settings()
    key = visitor_key(request)
    limit = settings.ask_questions_per_visitor_per_day
    if _consume_question(key) > limit:
        raise HTTPException(
            status_code=429,
            detail=f"You have used today's {limit} questions. The budget resets at midnight UTC.",
        )

    log_id = _start_log(key, payload.question)
    try:
        result = answer_question(get_llm(), payload.question, settings=settings)
    except LlmBudgetExceeded as exc:
        _finish_log(log_id, key, status="budget", refund=True)
        raise HTTPException(
            status_code=503,
            detail="The daily model budget for this demo is used up. Please try again tomorrow.",
        ) from exc
    except Exception:
        log.exception("agent failed")
        _finish_log(log_id, key, status="error")
        raise HTTPException(
            status_code=502, detail="The assistant could not answer right now."
        ) from None

    used = _finish_log(log_id, key, status="ok", result=result)
    return AskResponse(
        answer=result.answer,
        tool_calls=[
            ToolCallOut(name=t.name, arguments=t.arguments, ms=t.ms, ok=t.ok)
            for t in result.tool_calls
        ],
        model=result.model,
        total_tokens=result.total_tokens,
        latency_ms=result.latency_ms,
        questions_remaining=max(limit - used, 0),
        trace_id=result.trace_id,
    )
