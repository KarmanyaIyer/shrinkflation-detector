"""Operational summary for the CLI: tracked products, recent runs, model spend."""

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from shrinkflation.db.models import Change, LlmCall, PipelineRun, Product, Snapshot


@dataclass
class StatusReport:
    products_active: int
    products_total: int
    snapshots: int
    changes_by_status: dict[str, int]
    changes_by_kind: dict[str, int]
    llm_calls_today: int
    llm_cost_today_usd: Decimal
    llm_cost_total_usd: Decimal
    recent_runs: list[PipelineRun]

    def lines(self) -> list[str]:
        out = [
            f"products: {self.products_active} active of {self.products_total}",
            f"snapshots: {self.snapshots}",
            "changes by status: "
            + (", ".join(f"{k}={v}" for k, v in sorted(self.changes_by_status.items())) or "none"),
            "published changes by kind: "
            + (", ".join(f"{k}={v}" for k, v in sorted(self.changes_by_kind.items())) or "none"),
            f"model calls today: {self.llm_calls_today} (${self.llm_cost_today_usd:.4f}), "
            f"all time ${self.llm_cost_total_usd:.4f}",
            "recent runs:",
        ]
        for run in self.recent_runs:
            finished = run.finished_at.strftime("%Y-%m-%d %H:%M UTC") if run.finished_at else "-"
            out.append(
                f"  #{run.id} {run.kind} {run.status} finished {finished} "
                f"checked={run.products_checked} snapshots={run.snapshots_added} "
                f"changes={run.changes_found} api_calls={run.api_calls} errors={run.errors}"
            )
        if not self.recent_runs:
            out.append("  none")
        return out


def build_status(session: Session, *, runs: int = 5) -> StatusReport:
    today = datetime.now(UTC).date()
    day_start = datetime(today.year, today.month, today.day, tzinfo=UTC)
    calls_today, cost_today = session.execute(
        select(func.count(), func.coalesce(func.sum(LlmCall.cost_usd), 0)).where(
            LlmCall.created_at >= day_start
        )
    ).one()
    cost_total = session.execute(select(func.coalesce(func.sum(LlmCall.cost_usd), 0))).scalar_one()
    return StatusReport(
        products_active=session.execute(
            select(func.count()).where(Product.active.is_(True))
        ).scalar_one(),
        products_total=session.execute(select(func.count()).select_from(Product)).scalar_one(),
        snapshots=session.execute(select(func.count()).select_from(Snapshot)).scalar_one(),
        changes_by_status={
            status: count
            for status, count in session.execute(
                select(Change.status, func.count()).group_by(Change.status)
            ).all()
        },
        changes_by_kind={
            kind: count
            for kind, count in session.execute(
                select(Change.kind, func.count())
                .where(Change.status == "published")
                .group_by(Change.kind)
            ).all()
        },
        llm_calls_today=calls_today,
        llm_cost_today_usd=Decimal(cost_today),
        llm_cost_total_usd=Decimal(cost_total),
        recent_runs=list(
            session.execute(
                select(PipelineRun).order_by(PipelineRun.started_at.desc()).limit(runs)
            ).scalars()
        ),
    )
