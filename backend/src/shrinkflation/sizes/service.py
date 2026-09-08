"""Resolve a (size text, product name) pair to a cached SizeParse row.

Order: cache, deterministic rules, then a model. Ambiguous multipack labels such as
"6 ct / 18 oz" go straight to the strong model because deciding whether 18 oz is per item or
for the whole package needs product knowledge. Other labels try the fast model first and
escalate when it is unsure. A failed or budget-blocked model call returns None so the caller
can try again on a later run instead of caching a wrong answer.
"""

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from shrinkflation.db.models import SizeParse
from shrinkflation.llm.client import LlmBudgetExceeded, LlmClient, LlmOutputInvalid
from shrinkflation.sizes.llm_parser import parse_with_llm
from shrinkflation.sizes.rules import is_ambiguous_multipack, parse_with_rules
from shrinkflation.sizes.schema import ParsedSize

log = logging.getLogger(__name__)

ESCALATE_BELOW_CONFIDENCE = 0.6


def find_cached(session: Session, size_text: str, description: str) -> SizeParse | None:
    return session.execute(
        select(SizeParse).where(
            SizeParse.size_text == size_text, SizeParse.description == description
        )
    ).scalar_one_or_none()


def assign_parse(row: SizeParse, parsed: ParsedSize) -> bool:
    """Copy a ParsedSize onto a row. Returns True when any stored value changed."""
    values = {
        "measure_kind": parsed.measure_kind.value,
        "quantity": parsed.quantity,
        "base_unit": parsed.base_unit,
        "display_quantity": parsed.display_quantity,
        "display_unit": parsed.display_unit,
        "pack_count": parsed.pack_count,
        "confidence": parsed.confidence,
        "method": parsed.method,
        "model": parsed.model,
        "data": parsed.model_dump(mode="json"),
    }
    changed = False
    for name, value in values.items():
        current = getattr(row, name)
        if name in {"quantity", "display_quantity", "confidence"}:
            same = (current is None and value is None) or (
                current is not None and value is not None and float(current) == float(value)
            )
        else:
            same = current == value
        if not same:
            setattr(row, name, value)
            changed = True
    return changed


def store_parse(
    session: Session, size_text: str, description: str, parsed: ParsedSize
) -> SizeParse:
    row = SizeParse(size_text=size_text, description=description)
    assign_parse(row, parsed)
    session.add(row)
    session.flush()
    return row


def parse_size(
    llm: LlmClient | None,
    size_text: str,
    description: str,
    *,
    pipeline_run_id: int | None = None,
) -> ParsedSize | None:
    """Rules first, then a model. Returns None when no parse is available right now."""
    parsed = parse_with_rules(size_text)
    if parsed is not None or llm is None:
        return parsed
    return _parse_with_models(
        llm,
        size_text,
        description,
        pipeline_run_id,
        prefer_strong=is_ambiguous_multipack(size_text),
    )


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
    parsed = parse_size(llm, size_text, description, pipeline_run_id=pipeline_run_id)
    if parsed is None:
        return None
    return store_parse(session, size_text, description, parsed)


def _parse_with_models(
    llm: LlmClient,
    size_text: str,
    description: str,
    pipeline_run_id: int | None,
    *,
    prefer_strong: bool = False,
) -> ParsedSize | None:
    first_model = llm.strong_model if prefer_strong else llm.fast_model
    try:
        parsed, _ = parse_with_llm(
            llm, size_text, description, model=first_model, pipeline_run_id=pipeline_run_id
        )
    except LlmBudgetExceeded:
        return None
    except LlmOutputInvalid as exc:
        log.info("%s returned invalid size JSON for %r: %s", first_model, size_text, exc)
        parsed = None

    if prefer_strong or llm.strong_model == llm.fast_model:
        return parsed
    if parsed is not None and parsed.confidence >= ESCALATE_BELOW_CONFIDENCE:
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
