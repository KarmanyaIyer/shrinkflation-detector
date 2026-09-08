"""Read queries behind the public endpoints. Kept separate so the agent tools can reuse them."""

from collections.abc import Sequence

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.orm import Session, selectinload

from shrinkflation.db.models import Change, PipelineRun, Product, Snapshot

FEED_KINDS: dict[str, Sequence[str]] = {
    "shrink": ("shrink",),
    "grow": ("grow",),
    "price_increase": ("price_increase",),
    "price_decrease": ("price_decrease",),
    "all": ("shrink", "shrink_price_cut", "grow", "price_increase", "price_decrease"),
}

_change_load = (
    selectinload(Change.product),
    selectinload(Change.before_snapshot).selectinload(Snapshot.size_parse),
    selectinload(Change.after_snapshot).selectinload(Snapshot.size_parse),
)


def list_changes(
    session: Session,
    *,
    kind: str = "shrink",
    category: str | None = None,
    limit: int = 30,
    offset: int = 0,
) -> tuple[list[Change], int]:
    kinds = FEED_KINDS.get(kind, FEED_KINDS["shrink"])
    conditions = [Change.status == "published", Change.kind.in_(kinds)]
    if category:
        conditions.append(Product.category == category)
    base = select(Change).join(Change.product).where(*conditions)
    total = session.execute(select(func.count()).select_from(base.subquery())).scalar_one()
    rows = session.execute(
        base.options(*_change_load)
        .order_by(Change.detected_at.desc(), Change.id.desc())
        .limit(limit)
        .offset(offset)
    ).scalars()
    return list(rows), total


def get_product(session: Session, product_id: str) -> Product | None:
    return session.execute(
        select(Product)
        .where(Product.id == product_id)
        .options(
            selectinload(Product.snapshots).selectinload(Snapshot.size_parse),
            selectinload(Product.changes).options(*_change_load),
        )
    ).scalar_one_or_none()


def search_products(session: Session, query: str, *, limit: int = 20) -> list[Product]:
    words = [word for word in query.strip().split() if word]
    if not words:
        return []
    conditions = [
        or_(Product.description.ilike(f"%{word}%"), Product.brand.ilike(f"%{word}%"))
        for word in words
    ]
    return list(
        session.execute(
            select(Product)
            .where(Product.active, *conditions)
            .order_by(Product.description)
            .limit(limit)
        ).scalars()
    )


def category_counts(session: Session) -> list[tuple[str, int, int]]:
    product_counts = {
        category: count
        for category, count in session.execute(
            select(Product.category, func.count()).where(Product.active).group_by(Product.category)
        ).all()
    }
    change_counts = {
        category: count
        for category, count in session.execute(
            select(Product.category, func.count())
            .select_from(Change)
            .join(Change.product)
            .where(Change.status == "published", Change.kind.in_(FEED_KINDS["all"]))
            .group_by(Product.category)
        ).all()
    }
    return sorted(
        (category, count, change_counts.get(category, 0))
        for category, count in product_counts.items()
    )


def last_run(session: Session, kind: str | None = None) -> PipelineRun | None:
    query = select(PipelineRun).where(PipelineRun.status != "running")
    if kind:
        query = query.where(PipelineRun.kind == kind)
    return session.execute(
        query.order_by(PipelineRun.started_at.desc()).limit(1)
    ).scalar_one_or_none()


def list_catalog(
    session: Session,
    *,
    q: str | None,
    category: str | None,
    limit: int,
    offset: int,
) -> tuple[list[tuple[Product, Snapshot | None, int]], int]:
    """Tracked products with their latest snapshot and published change count."""
    latest_id = (
        select(Snapshot.id)
        .where(Snapshot.product_id == Product.id)
        .order_by(Snapshot.last_seen_at.desc(), Snapshot.id.desc())
        .limit(1)
        .correlate(Product)
        .scalar_subquery()
    )
    change_count = (
        select(func.count())
        .where(Change.product_id == Product.id, Change.status == "published")
        .correlate(Product)
        .scalar_subquery()
    )
    conditions: list[ColumnElement[bool]] = [Product.active.is_(True)]
    if category:
        conditions.append(Product.category == category)
    for word in (q or "").split():
        conditions.append(
            or_(Product.description.ilike(f"%{word}%"), Product.brand.ilike(f"%{word}%"))
        )
    total = session.execute(select(func.count()).where(*conditions)).scalar_one()
    rows = session.execute(
        select(Product, Snapshot, change_count)
        .outerjoin(Snapshot, Snapshot.id == latest_id)
        .options(selectinload(Snapshot.size_parse))
        .where(*conditions)
        .order_by(Product.description, Product.id)
        .limit(limit)
        .offset(offset)
    ).all()
    return [(product, snapshot, count) for product, snapshot, count in rows], total
