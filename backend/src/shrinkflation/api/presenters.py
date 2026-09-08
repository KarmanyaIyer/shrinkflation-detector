"""Convert ORM rows into API models, including per-unit prices in familiar units."""

from decimal import ROUND_HALF_UP, Decimal

from shrinkflation.api.schemas import ChangeOut, ProductSummary, SnapshotOut, UnitPrice
from shrinkflation.db.models import Change, Product, Snapshot
from shrinkflation.sizes.schema import clean_decimal

# Base unit -> (label, amount of base unit in one label unit)
FRIENDLY_UNITS: dict[str, tuple[str, Decimal]] = {
    "g": ("oz", Decimal("28.349523125")),
    "ml": ("fl oz", Decimal("29.5735295625")),
    "count": ("each", Decimal(1)),
    "m": ("ft", Decimal("0.3048")),
    "m2": ("sq ft", Decimal("0.09290304")),
}


def unit_price(
    price: Decimal | None, quantity: Decimal | None, base_unit: str | None
) -> UnitPrice | None:
    if price is None or quantity is None or quantity <= 0 or base_unit not in FRIENDLY_UNITS:
        return None
    label, per_label_unit = FRIENDLY_UNITS[base_unit]
    value = (price / quantity * per_label_unit).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    return UnitPrice(value=value, unit=label)


def snapshot_out(snapshot: Snapshot) -> SnapshotOut:
    parse = snapshot.size_parse
    return SnapshotOut(
        id=snapshot.id,
        size_text=snapshot.size_text,
        display_quantity=clean_decimal(parse.display_quantity)
        if parse and parse.display_quantity is not None
        else None,
        display_unit=parse.display_unit if parse else None,
        quantity=parse.quantity if parse else None,
        base_unit=parse.base_unit if parse else None,
        price_regular=snapshot.price_regular,
        price_promo=snapshot.price_promo,
        unit_price=unit_price(
            snapshot.price_regular,
            parse.quantity if parse else None,
            parse.base_unit if parse else None,
        ),
        first_seen_at=snapshot.first_seen_at,
        last_seen_at=snapshot.last_seen_at,
        observations=snapshot.observations,
        parse_method=parse.method if parse else None,
        parse_confidence=float(parse.confidence) if parse else None,
    )


def product_summary(product: Product) -> ProductSummary:
    return ProductSummary(
        id=product.id,
        description=product.description,
        brand=product.brand,
        category=product.category,
        image_url=product.image_url,
    )


def change_out(change: Change) -> ChangeOut:
    return ChangeOut(
        id=change.id,
        kind=change.kind,
        source=change.source,
        product=product_summary(change.product),
        before=snapshot_out(change.before_snapshot) if change.before_snapshot else None,
        after=snapshot_out(change.after_snapshot) if change.after_snapshot else None,
        size_change_pct=change.size_change_pct,
        price_change_pct=change.price_change_pct,
        unit_price_change_pct=change.unit_price_change_pct,
        before_seen_at=change.before_seen_at,
        after_seen_at=change.after_seen_at,
        detected_at=change.detected_at,
        note=change.note,
    )
