"""Read endpoints: feed, product detail, search, categories, stats, health."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from shrinkflation.api import queries
from shrinkflation.api.presenters import change_out, product_summary, snapshot_out
from shrinkflation.api.schemas import (
    CatalogItem,
    CatalogList,
    CategoryCount,
    ChangeList,
    Health,
    LastRun,
    ProductDetail,
    ProductSearchResult,
    Stats,
)
from shrinkflation.config import get_settings
from shrinkflation.db.models import Change, LlmCall, Product, Snapshot
from shrinkflation.db.session import get_db

router = APIRouter(prefix="/api", tags=["public"])
DbSession = Annotated[Session, Depends(get_db)]

FEED_CACHE = "public, max-age=300, stale-while-revalidate=600"


def _cache(response: Response, value: str = FEED_CACHE) -> None:
    response.headers["Cache-Control"] = value


@router.get("/health", response_model=Health)
def health(db: DbSession, response: Response) -> Health:
    _cache(response, "no-store")
    try:
        db.execute(select(1))
        database = "ok"
    except Exception:
        database = "error"
    run = queries.last_run(db) if database == "ok" else None
    return Health(
        status="ok" if database == "ok" else "degraded",
        database=database,
        last_run_finished_at=run.finished_at if run else None,
    )


@router.get("/stats", response_model=Stats)
def stats(db: DbSession, response: Response) -> Stats:
    _cache(response)
    settings = get_settings()
    products_tracked = db.execute(select(func.count()).where(Product.active)).scalar_one()
    categories = db.execute(
        select(func.count(func.distinct(Product.category))).where(Product.active)
    ).scalar_one()
    snapshots = db.execute(select(func.count()).select_from(Snapshot)).scalar_one()
    kind_counts = {
        kind: count
        for kind, count in db.execute(
            select(Change.kind, func.count())
            .where(Change.status == "published")
            .group_by(Change.kind)
        ).all()
    }
    llm_calls, llm_cost = db.execute(
        select(func.count(), func.coalesce(func.sum(LlmCall.cost_usd), 0)).select_from(LlmCall)
    ).one()
    tracking_since: datetime | None = db.execute(select(func.min(Product.first_seen_at))).scalar()
    run = queries.last_run(db, kind="refresh") or queries.last_run(db)
    return Stats(
        products_tracked=products_tracked,
        categories=categories,
        snapshots=snapshots,
        changes_published=sum(kind_counts.get(kind, 0) for kind in queries.FEED_KINDS["all"]),
        shrink_count=kind_counts.get("shrink", 0),
        grow_count=kind_counts.get("grow", 0),
        price_increase_count=kind_counts.get("price_increase", 0),
        llm_calls=llm_calls,
        llm_cost_usd=llm_cost,
        tracking_since=tracking_since,
        last_run=LastRun.model_validate(run) if run else None,
        location_label=settings.kroger_location_label,
    )


@router.get("/changes", response_model=ChangeList)
def changes(
    db: DbSession,
    response: Response,
    kind: Annotated[
        str, Query(pattern="^(shrink|grow|price_increase|price_decrease|all)$")
    ] = "shrink",
    category: Annotated[str | None, Query(max_length=80)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    offset: Annotated[int, Query(ge=0, le=10_000)] = 0,
) -> ChangeList:
    _cache(response)
    rows, total = queries.list_changes(db, kind=kind, category=category, limit=limit, offset=offset)
    return ChangeList(
        items=[change_out(row) for row in rows], total=total, limit=limit, offset=offset
    )


@router.get("/products", response_model=ProductSearchResult)
def products(
    db: DbSession,
    response: Response,
    q: Annotated[str, Query(min_length=2, max_length=80)],
) -> ProductSearchResult:
    _cache(response)
    return ProductSearchResult(items=[product_summary(p) for p in queries.search_products(db, q)])


@router.get("/products/{product_id}", response_model=ProductDetail)
def product_detail(
    db: DbSession,
    response: Response,
    product_id: Annotated[str, Path(min_length=4, max_length=32, pattern=r"^\d+$")],
) -> ProductDetail:
    _cache(response)
    product = queries.get_product(db, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="product not found")
    snapshots = sorted(product.snapshots, key=lambda s: (s.first_seen_at, s.id))
    changes_sorted = sorted(
        (c for c in product.changes if c.status == "published"),
        key=lambda c: c.detected_at,
        reverse=True,
    )
    return ProductDetail(
        product=product_summary(product),
        upc=product.upc,
        retailer_categories=list(product.retailer_categories),
        active=product.active,
        first_seen_at=product.first_seen_at,
        last_seen_at=product.last_seen_at,
        current=snapshot_out(snapshots[-1]) if snapshots else None,
        snapshots=[snapshot_out(s) for s in snapshots],
        changes=[change_out(c) for c in changes_sorted],
    )


@router.get("/categories", response_model=list[CategoryCount])
def categories(db: DbSession, response: Response) -> list[CategoryCount]:
    _cache(response)
    return [
        CategoryCount(category=category, products=products_count, changes=changes_count)
        for category, products_count, changes_count in queries.category_counts(db)
    ]


@router.get("/catalog", response_model=CatalogList)
def catalog(
    db: DbSession,
    response: Response,
    q: Annotated[str | None, Query(min_length=2, max_length=80)] = None,
    category: Annotated[str | None, Query(max_length=80)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0, le=10_000)] = 0,
) -> CatalogList:
    """Tracked products with their current state, filtered by search words or category."""
    _cache(response)
    rows, total = queries.list_catalog(db, q=q, category=category, limit=limit, offset=offset)
    return CatalogList(
        items=[
            CatalogItem(
                product=product_summary(product),
                current=snapshot_out(snapshot) if snapshot else None,
                first_seen_at=product.first_seen_at,
                changes=count,
            )
            for product, snapshot, count in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
    )
