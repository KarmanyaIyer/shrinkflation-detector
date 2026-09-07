"""Bookkeeping for pipeline runs so the site can show when the data was last refreshed."""

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from shrinkflation.db.models import PipelineRun


def start_run(session: Session, kind: str, **meta: object) -> PipelineRun:
    run = PipelineRun(kind=kind, status="running", started_at=datetime.now(UTC), meta=dict(meta))
    session.add(run)
    session.flush()
    return run


def finish_run(run: PipelineRun, *, status: str = "ok", error_sample: str | None = None) -> None:
    run.status = status
    run.finished_at = datetime.now(UTC)
    if error_sample:
        run.error_sample = error_sample[:2000]
