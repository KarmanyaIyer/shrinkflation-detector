"""Turn one catalog reading into snapshot rows and, when the state changed, a change row."""

import logging
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from shrinkflation.db.models import Change, Product, Snapshot
from shrinkflation.kroger.models import KrogerProduct
from shrinkflation.llm.client import LlmClient
from shrinkflation.pipeline.detect import SnapshotView, classify_transition
from shrinkflation.sizes.service import resolve_size

log = logging.getLogger(__name__)


@dataclass
class ObserveResult:
    snapshot_added: bool = False
    change: Change | None = None


def latest_snapshot(session: Session, product_id: str) -> Snapshot | None:
    return session.execute(
        select(Snapshot)
        .where(Snapshot.product_id == product_id)
        .order_by(Snapshot.last_seen_at.desc(), Snapshot.id.desc())
        .limit(1)
    ).scalar_one_or_none()


def _same_state(
    snapshot: Snapshot, size_text: str, price: Decimal | None, description: str
) -> bool:
    return (
        snapshot.size_text.strip().lower() == size_text.strip().lower()
        and snapshot.price_regular == price
        and snapshot.description.strip() == description.strip()
    )


def observe_product(
    session: Session,
    product: Product,
    reading: KrogerProduct,
    *,
    location_id: str,
    now: datetime,
    llm: LlmClient | None,
    pipeline_run_id: int | None = None,
) -> ObserveResult:
    """Record what the catalog says about a product right now.

    If nothing changed since the latest snapshot, that snapshot's last_seen_at moves forward.
    Otherwise a new snapshot is written and the transition is classified.
    """
    item = reading.item
    size_text = (item.size if item and item.size else "").strip()
    price = item.price.regular if item and item.price else None
    promo = item.price.promo_or_none if item and item.price else None
    description = reading.description.strip()

    product.last_seen_at = now
    product.active = True
    if reading.brand and not product.brand:
        product.brand = reading.brand
    if not product.image_url:
        product.image_url = reading.image_url()

    latest = latest_snapshot(session, product.id)
    if latest is not None and _same_state(latest, size_text, price, description):
        latest.last_seen_at = now
        latest.observations += 1
        latest.price_promo = promo
        if latest.size_parse is None:
            latest.size_parse = resolve_size(
                session, llm, size_text, description, pipeline_run_id=pipeline_run_id
            )
        return ObserveResult()

    if latest is not None and latest.size_parse is None:
        latest.size_parse = resolve_size(
            session, llm, latest.size_text, latest.description, pipeline_run_id=pipeline_run_id
        )

    snapshot = Snapshot(
        product_id=product.id,
        location_id=location_id,
        size_text=size_text,
        description=description,
        sold_by=item.sold_by if item else None,
        price_regular=price,
        price_promo=promo,
        first_seen_at=now,
        last_seen_at=now,
        observations=1,
        raw=item.model_dump(mode="json", by_alias=True) if item else {},
    )
    snapshot.size_parse = resolve_size(
        session, llm, size_text, description, pipeline_run_id=pipeline_run_id
    )
    if latest is not None:
        product.description = description
    session.add(snapshot)
    session.flush()

    result = ObserveResult(snapshot_added=True)
    if latest is None:
        return result

    draft = classify_transition(
        SnapshotView.from_snapshot(latest), SnapshotView.from_snapshot(snapshot)
    )
    if draft is None:
        return result
    before_parse = latest.size_parse
    after_parse = snapshot.size_parse
    change = Change(
        product_id=product.id,
        kind=draft.kind,
        source="kroger",
        status=draft.status,
        before_snapshot_id=latest.id,
        after_snapshot_id=snapshot.id,
        base_unit=after_parse.base_unit if after_parse else None,
        before_quantity=before_parse.quantity if before_parse else None,
        after_quantity=after_parse.quantity if after_parse else None,
        before_size_text=latest.size_text,
        after_size_text=snapshot.size_text,
        before_price=latest.price_regular,
        after_price=snapshot.price_regular,
        size_change_pct=draft.size_change_pct,
        price_change_pct=draft.price_change_pct,
        unit_price_change_pct=draft.unit_price_change_pct,
        before_seen_at=latest.last_seen_at,
        after_seen_at=snapshot.first_seen_at,
        detected_at=now,
        evidence=draft.evidence,
        note=draft.note,
    )
    session.add(change)
    session.flush()
    result.change = change
    log.info(
        "change %s for %s: %s -> %s", draft.kind, product.id, latest.size_text, snapshot.size_text
    )
    return result
