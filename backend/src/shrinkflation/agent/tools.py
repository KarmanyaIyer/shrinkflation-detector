"""Read-only tools the agent can call. Arguments are validated with Pydantic before any query
runs, and results are plain dictionaries built from the same queries the public API uses.
"""

from collections.abc import Callable
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from shrinkflation.api import queries
from shrinkflation.api.presenters import unit_price
from shrinkflation.db.models import Change, Product, Snapshot
from shrinkflation.sizes.schema import clean_decimal


class ToolArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SearchProductsArgs(ToolArgs):
    query: str = Field(
        min_length=2, max_length=80, description="Words from the product or brand name"
    )


class ProductHistoryArgs(ToolArgs):
    product_id: str = Field(min_length=4, max_length=32, pattern=r"^\d+$")


class RecentChangesArgs(ToolArgs):
    kind: Literal["shrink", "grow", "price_increase", "price_decrease", "all"] = "shrink"
    category: str | None = Field(default=None, max_length=80)
    limit: int = Field(default=8, ge=1, le=10)


class TrackingStatsArgs(ToolArgs):
    pass


def _money(value: Any) -> str | None:
    return None if value is None else f"${value:.2f}"


def _snapshot(snapshot: Snapshot) -> dict[str, Any]:
    parse = snapshot.size_parse
    per_unit = unit_price(
        snapshot.price_regular,
        parse.quantity if parse else None,
        parse.base_unit if parse else None,
    )
    return {
        "size_text": snapshot.size_text,
        "normalized_size": f"{clean_decimal(parse.display_quantity)} {parse.display_unit}"
        if parse and parse.display_quantity and parse.display_unit
        else None,
        "regular_price": _money(snapshot.price_regular),
        "unit_price": f"${per_unit.value:.4f} per {per_unit.unit}" if per_unit else None,
        "first_seen": snapshot.first_seen_at.date().isoformat(),
        "last_seen": snapshot.last_seen_at.date().isoformat(),
        "days_observed": snapshot.observations,
    }


def _change(change: Change, *, with_product: bool = True) -> dict[str, Any]:
    out: dict[str, Any] = {
        "kind": change.kind,
        "source": change.source,
        "size_change_pct": float(change.size_change_pct)
        if change.size_change_pct is not None
        else None,
        "price_change_pct": float(change.price_change_pct)
        if change.price_change_pct is not None
        else None,
        "unit_price_change_pct": float(change.unit_price_change_pct)
        if change.unit_price_change_pct is not None
        else None,
        "before": {
            "size_text": change.before_size_text,
            "regular_price": _money(change.before_price),
        },
        "after": {"size_text": change.after_size_text, "regular_price": _money(change.after_price)},
        "last_seen_before": change.before_seen_at.date().isoformat()
        if change.before_seen_at
        else None,
        "first_seen_after": change.after_seen_at.date().isoformat()
        if change.after_seen_at
        else None,
        "detected_on": change.detected_at.date().isoformat(),
    }
    if with_product:
        out["product"] = {
            "product_id": change.product.id,
            "name": change.product.description,
            "brand": change.product.brand,
            "category": change.product.category,
        }
    return out


def search_products(session: Session, args: SearchProductsArgs) -> dict[str, Any]:
    products = queries.search_products(session, args.query, limit=8)
    items = []
    for product in products:
        latest = session.execute(
            select(Snapshot)
            .where(Snapshot.product_id == product.id)
            .order_by(Snapshot.last_seen_at.desc())
            .limit(1)
        ).scalar_one_or_none()
        change_count = session.execute(
            select(func.count()).where(
                Change.product_id == product.id, Change.status == "published"
            )
        ).scalar_one()
        items.append(
            {
                "product_id": product.id,
                "name": product.description,
                "brand": product.brand,
                "category": product.category,
                "tracked_since": product.first_seen_at.date().isoformat(),
                "current": _snapshot(latest) if latest else None,
                "published_changes": change_count,
            }
        )
    return {
        "query": args.query,
        "matches": items,
        "note": None if items else "No tracked product matches.",
    }


def get_product_history(session: Session, args: ProductHistoryArgs) -> dict[str, Any]:
    product = queries.get_product(session, args.product_id)
    if product is None:
        return {"error": "No tracked product with that id."}
    snapshots = sorted(product.snapshots, key=lambda s: (s.first_seen_at, s.id))[-12:]
    changes = [c for c in product.changes if c.status == "published"]
    return {
        "product_id": product.id,
        "name": product.description,
        "brand": product.brand,
        "category": product.category,
        "tracked_since": product.first_seen_at.date().isoformat(),
        "still_listed": product.active,
        "states": [_snapshot(s) for s in snapshots],
        "changes": [_change(c, with_product=False) for c in changes],
    }


def list_recent_changes(session: Session, args: RecentChangesArgs) -> dict[str, Any]:
    rows, total = queries.list_changes(
        session, kind=args.kind, category=args.category, limit=args.limit, offset=0
    )
    return {"kind": args.kind, "total_published": total, "changes": [_change(c) for c in rows]}


def get_tracking_stats(session: Session, args: TrackingStatsArgs) -> dict[str, Any]:
    tracked = session.execute(select(func.count()).where(Product.active)).scalar_one()
    since = session.execute(select(func.min(Product.first_seen_at))).scalar()
    run = queries.last_run(session, kind="refresh") or queries.last_run(session)
    kinds = {
        kind: count
        for kind, count in session.execute(
            select(Change.kind, func.count())
            .where(Change.status == "published")
            .group_by(Change.kind)
        ).all()
    }
    return {
        "products_tracked": tracked,
        "tracking_since": since.date().isoformat() if since else None,
        "last_refresh": run.finished_at.isoformat() if run and run.finished_at else None,
        "published_changes_by_kind": kinds,
        "categories": [
            {"name": category, "products": products, "published_changes": changes}
            for category, products, changes in queries.category_counts(session)
        ],
    }


ToolFn = Callable[[Session, Any], dict[str, Any]]

TOOLS: dict[str, tuple[type[ToolArgs], ToolFn, str]] = {
    "search_products": (
        SearchProductsArgs,
        search_products,
        "Find tracked products by words from their name or brand. Use this first when the user "
        "names a product.",
    ),
    "get_product_history": (
        ProductHistoryArgs,
        get_product_history,
        "Full size and price history for one tracked product, with any recorded changes.",
    ),
    "list_recent_changes": (
        RecentChangesArgs,
        list_recent_changes,
        "Most recent published changes across all tracked products, optionally filtered by kind "
        "or category.",
    ),
    "get_tracking_stats": (
        TrackingStatsArgs,
        get_tracking_stats,
        "How many products are tracked, since when, the last refresh time, and per-category "
        "product and change counts.",
    ),
}


def tool_definitions() -> list[dict[str, Any]]:
    definitions = []
    for name, (args_model, _, description) in TOOLS.items():
        schema = args_model.model_json_schema()
        schema.pop("title", None)
        definitions.append(
            {
                "type": "function",
                "function": {"name": name, "description": description, "parameters": schema},
            }
        )
    return definitions


def run_tool(session: Session, name: str, raw_arguments: dict[str, Any]) -> dict[str, Any]:
    entry = TOOLS.get(name)
    if entry is None:
        return {"error": f"Unknown tool {name}."}
    args_model, fn, _ = entry
    try:
        args = args_model.model_validate(raw_arguments)
    except ValidationError as exc:
        return {"error": "Invalid arguments.", "details": exc.errors(include_url=False)[:3]}
    return fn(session, args)
