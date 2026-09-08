"""Daily refresh: read every tracked product from the catalog and record what changed."""

import logging
from datetime import UTC, datetime, timedelta
from typing import Any, cast

from sqlalchemy import CursorResult, select, update

from shrinkflation.config import get_settings
from shrinkflation.db.models import PipelineRun, Product
from shrinkflation.db.session import session_scope
from shrinkflation.kroger.client import KrogerClient, KrogerError
from shrinkflation.llm.client import LlmClient
from shrinkflation.observability import get_tracer, setup_tracing, shutdown_tracing
from shrinkflation.pipeline.observe import observe_product
from shrinkflation.pipeline.runs import finish_run, start_run

log = logging.getLogger(__name__)

BATCH_SIZE = 50
INACTIVE_AFTER = timedelta(days=14)


def run_refresh(*, kroger: KrogerClient | None = None, llm: LlmClient | None = None) -> int:
    """Refresh all active products. Returns the pipeline run id."""
    setup_tracing()
    settings = get_settings()
    location_id = settings.kroger_location_id
    if not location_id:
        raise RuntimeError("KROGER_LOCATION_ID is not set")
    owns_kroger, owns_llm = kroger is None, llm is None
    kroger = kroger or KrogerClient(settings)
    llm = llm or LlmClient(settings)
    try:
        return _refresh(kroger, llm, location_id)
    finally:
        if owns_kroger:
            kroger.close()
        if owns_llm:
            llm.close()


def _refresh(kroger: KrogerClient, llm: LlmClient, location_id: str) -> int:
    tracer = get_tracer()

    with session_scope() as session:
        run = start_run(session, "refresh", location_id=location_id)
        run_id = run.id
        product_ids = list(session.execute(select(Product.id).where(Product.active)).scalars())

    log.info("refresh run %s: %d products", run_id, len(product_ids))
    checked = added = found = errors = 0
    error_sample: str | None = None
    now = datetime.now(UTC)

    with tracer.start_as_current_span("pipeline.refresh") as span:
        span.set_attribute("shrinkflation.run_id", run_id)
        span.set_attribute("shrinkflation.products", len(product_ids))
        for offset in range(0, len(product_ids), BATCH_SIZE):
            batch = product_ids[offset : offset + BATCH_SIZE]
            try:
                readings = kroger.products_by_ids(batch, location_id)
            except KrogerError as exc:
                errors += 1
                error_sample = error_sample or f"kroger batch failed: {exc}"
                log.warning("batch at %d failed: %s", offset, exc)
                continue
            by_id = {reading.product_id: reading for reading in readings}
            for product_id in batch:
                reading = by_id.get(product_id)
                if reading is None:
                    continue
                try:
                    with session_scope() as session:
                        product = session.get(Product, product_id)
                        if product is None:
                            continue
                        result = observe_product(
                            session,
                            product,
                            reading,
                            location_id=location_id,
                            now=now,
                            llm=llm,
                            pipeline_run_id=run_id,
                        )
                    checked += 1
                    added += int(result.snapshot_added)
                    found += int(result.change is not None)
                except Exception as exc:
                    errors += 1
                    error_sample = error_sample or f"{product_id}: {type(exc).__name__}: {exc}"
                    log.exception("observe failed for %s", product_id)

        with session_scope() as session:
            stale = update(Product).where(
                Product.active, Product.last_seen_at < now - INACTIVE_AFTER
            )
            deactivated = cast(
                CursorResult[Any], session.execute(stale.values(active=False))
            ).rowcount
            run = session.get(PipelineRun, run_id)
            assert run is not None
            run.products_checked = checked
            run.snapshots_added = added
            run.changes_found = found
            run.api_calls = kroger.calls_made
            run.errors = errors
            run.meta = {**run.meta, "deactivated": deactivated, "requested": len(product_ids)}
            finish_run(run, status="ok" if errors == 0 else "partial", error_sample=error_sample)
        span.set_attribute("shrinkflation.changes_found", found)
        span.set_attribute("shrinkflation.errors", errors)

    log.info(
        "refresh run %s done: checked=%d new_snapshots=%d changes=%d errors=%d",
        run_id,
        checked,
        added,
        found,
        errors,
    )
    shutdown_tracing()
    return run_id
