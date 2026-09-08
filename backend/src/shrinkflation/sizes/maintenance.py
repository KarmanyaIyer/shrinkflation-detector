"""Re-run size parsing for cached parses after the parser changes. Rows are updated in place so
snapshots keep pointing at the same parse ids.
"""

import logging
from dataclasses import dataclass

from sqlalchemy import or_, select

from shrinkflation.config import get_settings
from shrinkflation.db.models import Change, SizeParse, Snapshot
from shrinkflation.db.session import session_scope
from shrinkflation.llm.client import LlmClient
from shrinkflation.observability import setup_tracing, shutdown_tracing
from shrinkflation.sizes.rules import is_ambiguous_multipack, parse_with_rules
from shrinkflation.sizes.service import assign_parse, parse_size

log = logging.getLogger(__name__)


@dataclass
class ReparseStats:
    considered: int = 0
    changed: int = 0
    unresolved: int = 0
    changes_demoted: int = 0


def _demote_affected_changes(changed_parse_ids: list[int]) -> int:
    """Pull published changes whose evidence was reparsed back to needs_review.

    A revised parse can contradict the stored percentages and kind, so those rows stop being
    publicly served until the next refresh or a manual check re-establishes them.
    """
    if not changed_parse_ids:
        return 0
    with session_scope() as session:
        snapshot_ids = select(Snapshot.id).where(Snapshot.size_parse_id.in_(changed_parse_ids))
        affected = (
            session.execute(
                select(Change).where(
                    Change.status == "published",
                    or_(
                        Change.before_snapshot_id.in_(snapshot_ids),
                        Change.after_snapshot_id.in_(snapshot_ids),
                    ),
                )
            )
            .scalars()
            .all()
        )
        for change in affected:
            change.status = "needs_review"
            change.note = "size parse revised after a parser update; numbers need rechecking"
        return len(affected)


def needs_reparse(row: SizeParse) -> bool:
    """Rows the rules no longer accept, rows the rules now read differently, and unknowns."""
    if row.measure_kind == "unknown":
        return True
    if row.method != "rule":
        strong = get_settings().llm_model_strong
        return is_ambiguous_multipack(row.size_text) and row.model != strong
    fresh = parse_with_rules(row.size_text)
    if fresh is None:
        return True
    return (
        fresh.quantity is None
        or row.quantity is None
        or float(fresh.quantity) != float(row.quantity)
        or fresh.pack_count != row.pack_count
    )


def run_reparse(*, everything: bool = False, llm: LlmClient | None = None) -> ReparseStats:
    setup_tracing()
    owns_llm = llm is None
    llm = llm or LlmClient(get_settings())
    try:
        return _reparse(llm, everything=everything)
    finally:
        if owns_llm:
            llm.close()


def _reparse(llm: LlmClient, *, everything: bool) -> ReparseStats:
    stats = ReparseStats()
    with session_scope() as session:
        rows = session.execute(select(SizeParse).order_by(SizeParse.id)).scalars().all()
        ids = [row.id for row in rows if everything or needs_reparse(row)]
    stats.considered = len(ids)
    log.info("reparse: %d of %d cached parses selected", len(ids), len(rows))
    changed_parse_ids: list[int] = []
    for parse_id in ids:
        with session_scope() as session:
            row = session.get(SizeParse, parse_id)
            if row is None:
                continue
            parsed = parse_size(llm, row.size_text, row.description)
            if parsed is None:
                stats.unresolved += 1
                continue
            if assign_parse(row, parsed):
                stats.changed += 1
                changed_parse_ids.append(parse_id)
                log.info(
                    "%r (%s): now %s %s, pack %s, confidence %.2f via %s",
                    row.size_text,
                    row.description[:40],
                    row.display_quantity,
                    row.display_unit,
                    row.pack_count,
                    float(row.confidence),
                    row.model or row.method,
                )
    stats.changes_demoted = _demote_affected_changes(changed_parse_ids)
    log.info(
        "reparse done: %d considered, %d changed, %d unresolved, %d changes back to review",
        stats.considered,
        stats.changed,
        stats.unresolved,
        stats.changes_demoted,
    )
    shutdown_tracing()
    return stats
