"""Resolve a (size text, product name) pair to a cached SizeParse row.

Order: cache, deterministic rules, fast model, strong model when the fast one is unsure.
A failed or budget-blocked model call returns None so the caller can try again on a later run
instead of caching a wrong answer.
"""

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from shrinkflation.db.models import SizeParse
from shrinkflation.llm.client import LlmBudgetExceeded, LlmClient, LlmOutputInvalid
from shrinkflation.sizes.llm_parser import parse_with_llm
from shrinkflation.sizes.rules import parse_with_rules
from shrinkflation.sizes.schema import ParsedSize

log = logging.getLogger(__name__)

ESCALATE_BELOW_CONFIDENCE = 0.6


def find_cached(session: Session, size_text: str, description: str) -> SizeParse | None:
    return session.execute(
        select(SizeParse).where(
            SizeParse.size_text == size_text, SizeParse.description == description
        )
    ).scalar_one_or_none()


def store_parse(
    session: Session, size_text: str, description: str, parsed: ParsedSize
) -> SizeParse:
    row = SizeParse(
        size_text=size_text,
        description=description,
        measure_kind=parsed.measure_kind.value,
        quantity=parsed.quantity,
        base_unit=parsed.base_unit,
        display_quantity=parsed.display_quantity,
        display_unit=parsed.display_unit,
        pack_count=parsed.pack_count,
        confidence=parsed.confidence,
        method=parsed.method,
        model=parsed.model,
        data=parsed.model_dump(mode="json"),
    )
    session.add(row)
    session.flush()
    return row


def resolve_size(
    session: Session,
    llm: LlmClient | None,
    size_text: str | None,
    description: str,
    *,
    pipeline_run_id: int | None = None,
) -> SizeParse | None:
    size_text = (size_text or "").strip()
    description = description.strip()
    cached = find_cached(session, size_text, description)
    if cached is not None:
        return cached

    parsed = parse_with_rules(size_text)
    if parsed is None and llm is not None:
        parsed = _parse_with_models(llm, size_text, description, pipeline_run_id)
    if parsed is None:
        return None
    return store_parse(session, size_text, description, parsed)


def _parse_with_models(
    llm: LlmClient, size_text: str, description: str, pipeline_run_id: int | None
) -> ParsedSize | None:
    try:
        parsed, _ = parse_with_llm(
            llm, size_text, description, model=llm.fast_model, pipeline_run_id=pipeline_run_id
        )
    except LlmBudgetExceeded:
        return None
    except LlmOutputInvalid as exc:
        log.info("fast model returned invalid size JSON for %r: %s", size_text, exc)
        parsed = None

    if parsed is not None and parsed.confidence >= ESCALATE_BELOW_CONFIDENCE:
        return parsed
    if llm.strong_model == llm.fast_model:
        return parsed
    try:
        stronger, _ = parse_with_llm(
            llm, size_text, description, model=llm.strong_model, pipeline_run_id=pipeline_run_id
        )
    except (LlmBudgetExceeded, LlmOutputInvalid) as exc:
        log.info("strong model could not parse %r: %s", size_text, exc)
        return parsed
    if parsed is None or stronger.confidence >= parsed.confidence:
        return stronger
    return parsed
