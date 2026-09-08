"""Re-run size parsing for cached parses after the parser changes. Rows are updated in place so
snapshots keep pointing at the same parse ids.
"""

import logging
from dataclasses import dataclass

from sqlalchemy import select

from shrinkflation.config import get_settings
from shrinkflation.db.models import SizeParse
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
    llm = llm or LlmClient(get_settings())
    stats = ReparseStats()
    with session_scope() as session:
        rows = session.execute(select(SizeParse).order_by(SizeParse.id)).scalars().all()
        ids = [row.id for row in rows if everything or needs_reparse(row)]
    stats.considered = len(ids)
    log.info("reparse: %d of %d cached parses selected", len(ids), len(rows))
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
    log.info(
        "reparse done: %d considered, %d changed, %d unresolved",
        stats.considered,
        stats.changed,
        stats.unresolved,
    )
    shutdown_tracing()
    return stats
