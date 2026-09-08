"""Classify the transition between two consecutive snapshots of one product.

The rules are deliberately conservative. A change is published only when both snapshots have a
confident, comparable size reading; everything else is kept for review rather than shown.
"""

from dataclasses import dataclass, field
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from shrinkflation.db.models import Snapshot

# Relative size differences below this are rounding noise (16 oz vs 1 lb, 1 gal vs 128 fl oz).
SIZE_NOISE_PCT = Decimal("0.5")
PRICE_NOISE_PCT = Decimal("0.5")
# Beyond this the two snapshots are more likely a parse error or a different product.
SIZE_SUSPECT_PCT = Decimal("80")
PUBLISH_MIN_CONFIDENCE = 0.7

KIND_SHRINK = "shrink"
KIND_SHRINK_PRICE_CUT = "shrink_price_cut"
KIND_GROW = "grow"
KIND_PRICE_INCREASE = "price_increase"
KIND_PRICE_DECREASE = "price_decrease"
KIND_RELABEL = "relabel"
KIND_UNREADABLE = "unreadable_size_change"

STATUS_PUBLISHED = "published"
STATUS_REVIEW = "needs_review"
STATUS_HIDDEN = "hidden"


@dataclass(frozen=True)
class SnapshotView:
    """The parts of a snapshot the classifier needs. Built from ORM rows or test values."""

    id: int | None
    size_text: str
    price_regular: Decimal | None
    first_seen_at: datetime | None
    last_seen_at: datetime | None
    quantity: Decimal | None = None
    base_unit: str | None = None
    measure_kind: str | None = None
    confidence: float = 0.0
    display_quantity: Decimal | None = None
    display_unit: str | None = None
    parse_method: str | None = None

    @classmethod
    def from_snapshot(cls, snapshot: Snapshot) -> "SnapshotView":
        parse = snapshot.size_parse
        return cls(
            id=snapshot.id,
            size_text=snapshot.size_text,
            price_regular=snapshot.price_regular,
            first_seen_at=snapshot.first_seen_at,
            last_seen_at=snapshot.last_seen_at,
            quantity=parse.quantity if parse else None,
            base_unit=parse.base_unit if parse else None,
            measure_kind=parse.measure_kind if parse else None,
            confidence=float(parse.confidence) if parse else 0.0,
            display_quantity=parse.display_quantity if parse else None,
            display_unit=parse.display_unit if parse else None,
            parse_method=parse.method if parse else None,
        )

    @property
    def comparable(self) -> bool:
        return self.quantity is not None and self.quantity > 0 and self.base_unit is not None

    @property
    def unit_price(self) -> Decimal | None:
        if self.price_regular is None or not self.comparable:
            return None
        assert self.quantity is not None
        return self.price_regular / self.quantity


@dataclass
class ChangeDraft:
    kind: str
    status: str
    size_change_pct: Decimal | None = None
    price_change_pct: Decimal | None = None
    unit_price_change_pct: Decimal | None = None
    evidence: dict[str, Any] = field(default_factory=dict)
    note: str | None = None


def pct_change(before: Decimal | None, after: Decimal | None) -> Decimal | None:
    if before is None or after is None or before == 0:
        return None
    return ((after - before) / before * 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _opt_str(value: Decimal | None) -> str | None:
    return None if value is None else str(value)


def _evidence(before: SnapshotView, after: SnapshotView) -> dict[str, Any]:
    def side(view: SnapshotView) -> dict[str, Any]:
        unit_price = view.unit_price
        return {
            "snapshot_id": view.id,
            "size_text": view.size_text,
            "display_quantity": _opt_str(view.display_quantity),
            "display_unit": view.display_unit,
            "quantity": _opt_str(view.quantity),
            "base_unit": view.base_unit,
            "price_regular": _opt_str(view.price_regular),
            "unit_price": _opt_str(unit_price.quantize(Decimal("0.000001")))
            if unit_price is not None
            else None,
            "parse_method": view.parse_method,
            "parse_confidence": view.confidence,
            "first_seen_at": view.first_seen_at.isoformat() if view.first_seen_at else None,
            "last_seen_at": view.last_seen_at.isoformat() if view.last_seen_at else None,
        }

    return {"before": side(before), "after": side(after)}


def classify_transition(before: SnapshotView, after: SnapshotView) -> ChangeDraft | None:
    """Return the change between two snapshots, or None when nothing worth recording changed."""
    price_pct = pct_change(before.price_regular, after.price_regular)
    price_moved = price_pct is not None and abs(price_pct) >= PRICE_NOISE_PCT
    size_text_changed = before.size_text.strip().lower() != after.size_text.strip().lower()
    evidence = _evidence(before, after)

    if not (before.comparable and after.comparable) or before.base_unit != after.base_unit:
        if size_text_changed:
            return ChangeDraft(
                kind=KIND_UNREADABLE,
                status=STATUS_REVIEW,
                price_change_pct=price_pct,
                evidence=evidence,
                note="size text changed but the two readings cannot be compared",
            )
        if price_moved:
            return _price_only(price_pct, evidence)
        return None

    assert before.quantity is not None and after.quantity is not None
    size_pct = pct_change(before.quantity, after.quantity)
    assert size_pct is not None
    unit_pct = pct_change(before.unit_price, after.unit_price)
    confident = min(before.confidence, after.confidence) >= PUBLISH_MIN_CONFIDENCE
    status = STATUS_PUBLISHED if confident else STATUS_REVIEW

    if abs(size_pct) < SIZE_NOISE_PCT:
        if size_text_changed and not price_moved:
            return ChangeDraft(
                kind=KIND_RELABEL, status=STATUS_HIDDEN, size_change_pct=size_pct, evidence=evidence
            )
        if price_moved:
            draft = _price_only(price_pct, evidence)
            draft.size_change_pct = size_pct
            draft.unit_price_change_pct = unit_pct
            return draft
        return None

    if abs(size_pct) > SIZE_SUSPECT_PCT:
        status = STATUS_REVIEW

    if size_pct < 0:
        cheaper_per_unit = unit_pct is not None and unit_pct <= -PRICE_NOISE_PCT
        kind = KIND_SHRINK_PRICE_CUT if cheaper_per_unit else KIND_SHRINK
    else:
        kind = KIND_GROW
    return ChangeDraft(
        kind=kind,
        status=status,
        size_change_pct=size_pct,
        price_change_pct=price_pct,
        unit_price_change_pct=unit_pct,
        evidence=evidence,
    )


def _price_only(price_pct: Decimal | None, evidence: dict[str, Any]) -> ChangeDraft:
    assert price_pct is not None
    kind = KIND_PRICE_INCREASE if price_pct > 0 else KIND_PRICE_DECREASE
    return ChangeDraft(
        kind=kind, status=STATUS_PUBLISHED, price_change_pct=price_pct, evidence=evidence
    )
