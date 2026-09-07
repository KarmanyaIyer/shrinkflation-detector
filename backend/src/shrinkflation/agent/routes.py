"""POST /api/ask: the public question endpoint with per-visitor daily budgets."""

import logging
from datetime import UTC, datetime
from functools import lru_cache
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from shrinkflation.agent.service import answer_question
from shrinkflation.api.limits import limiter, visitor_key
from shrinkflation.config import get_settings
from shrinkflation.db.models import AskLog, VisitorBudget
from shrinkflation.db.session import get_db
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


def _budget_row(db: Session, key: str) -> VisitorBudget:
    day = datetime.now(UTC).date()
    row = db.execute(
        select(VisitorBudget).where(VisitorBudget.visitor_key == key, VisitorBudget.day == day)
    ).scalar_one_or_none()
    if row is None:
        row = VisitorBudget(visitor_key=key, day=day, questions_used=0, tokens_used=0)
        db.add(row)
        db.flush()
    return row


@router.get("/ask/budget", response_model=BudgetOut)
def ask_budget(request: Request, db: DbSession) -> BudgetOut:
    settings = get_settings()
    row = _budget_row(db, visitor_key(request))
    return BudgetOut(
        questions_per_day=settings.ask_questions_per_visitor_per_day,
        questions_remaining=max(settings.ask_questions_per_visitor_per_day - row.questions_used, 0),
    )


@router.post("/ask", response_model=AskResponse)
@limiter.limit("10/minute")
def ask(request: Request, payload: AskRequest, db: DbSession) -> AskResponse:
    settings = get_settings()
    key = visitor_key(request)
    budget = _budget_row(db, key)
    limit = settings.ask_questions_per_visitor_per_day
    if budget.questions_used >= limit:
        raise HTTPException(
            status_code=429,
            detail=f"You have used today's {limit} questions. The budget resets at midnight UTC.",
        )
    budget.questions_used += 1
    db.flush()

    entry = AskLog(visitor_key=key, question=payload.question, status="pending")
    db.add(entry)
    db.flush()
    try:
        result = answer_question(db, get_llm(), payload.question, settings=settings)
    except LlmBudgetExceeded as exc:
        entry.status = "budget"
        budget.questions_used -= 1
        raise HTTPException(
            status_code=503,
            detail="The daily model budget for this demo is used up. Please try again tomorrow.",
        ) from exc
    except Exception:
        entry.status = "error"
        log.exception("agent failed")
        raise HTTPException(
            status_code=502, detail="The assistant could not answer right now."
        ) from None

    entry.answer = result.answer
    entry.tool_calls = [
        {"name": t.name, "arguments": t.arguments, "ms": t.ms, "ok": t.ok}
        for t in result.tool_calls
    ]
    entry.model = result.model
    entry.total_tokens = result.total_tokens
    entry.latency_ms = result.latency_ms
    entry.trace_id = result.trace_id
    entry.status = "ok"
    budget.tokens_used += result.total_tokens
    return AskResponse(
        answer=result.answer,
        tool_calls=[ToolCallOut(**entry_call) for entry_call in entry.tool_calls],
        model=result.model,
        total_tokens=result.total_tokens,
        latency_ms=result.latency_ms,
        questions_remaining=max(limit - budget.questions_used, 0),
        trace_id=result.trace_id,
    )
