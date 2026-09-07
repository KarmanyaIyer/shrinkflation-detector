from datetime import UTC, datetime
from decimal import Decimal

from shrinkflation.pipeline.detect import (
    KIND_GROW,
    KIND_PRICE_INCREASE,
    KIND_RELABEL,
    KIND_SHRINK,
    KIND_SHRINK_PRICE_CUT,
    KIND_UNREADABLE,
    STATUS_HIDDEN,
    STATUS_PUBLISHED,
    STATUS_REVIEW,
    SnapshotView,
    classify_transition,
)

T0 = datetime(2026, 8, 2, tzinfo=UTC)
T1 = datetime(2026, 8, 14, tzinfo=UTC)


def view(
    size_text: str,
    quantity: str | None,
    price: str | None,
    *,
    unit: str | None = "g",
    confidence: float = 1.0,
    snapshot_id: int = 1,
) -> SnapshotView:
    return SnapshotView(
        id=snapshot_id,
        size_text=size_text,
        price_regular=Decimal(price) if price else None,
        first_seen_at=T0,
        last_seen_at=T1,
        quantity=Decimal(quantity) if quantity else None,
        base_unit=unit if quantity else None,
        measure_kind="weight" if quantity else None,
        confidence=confidence,
        parse_method="rule",
    )


def test_shrink_same_price() -> None:
    draft = classify_transition(view("18 oz", "510.29", "4.29"), view("16.4 oz", "464.93", "4.29"))
    assert draft is not None
    assert draft.kind == KIND_SHRINK
    assert draft.status == STATUS_PUBLISHED
    assert draft.size_change_pct == Decimal("-8.89")
    assert draft.price_change_pct == Decimal("0.00")
    assert draft.unit_price_change_pct == Decimal("9.76")
    assert draft.evidence["before"]["size_text"] == "18 oz"


def test_shrink_with_proportional_price_cut_is_not_flagged_as_shrinkflation() -> None:
    draft = classify_transition(view("18 oz", "510.29", "4.29"), view("16.4 oz", "464.93", "3.79"))
    assert draft is not None
    assert draft.kind == KIND_SHRINK_PRICE_CUT


def test_grow() -> None:
    draft = classify_transition(view("16 oz", "453.59", "3.00"), view("18 oz", "510.29", "3.00"))
    assert draft is not None
    assert draft.kind == KIND_GROW


def test_relabel_same_quantity_is_hidden() -> None:
    draft = classify_transition(view("16 oz", "453.5924", "3.00"), view("1 lb", "453.5924", "3.00"))
    assert draft is not None
    assert draft.kind == KIND_RELABEL
    assert draft.status == STATUS_HIDDEN


def test_price_increase_same_size() -> None:
    draft = classify_transition(view("16 oz", "453.59", "3.00"), view("16 oz", "453.59", "3.49"))
    assert draft is not None
    assert draft.kind == KIND_PRICE_INCREASE
    assert draft.price_change_pct == Decimal("16.33")


def test_no_change_returns_none() -> None:
    same = view("16 oz", "453.59", "3.00")
    assert classify_transition(same, view("16 oz", "453.59", "3.00")) is None
    assert classify_transition(same, view("16 oz", "453.59", "3.01")) is None


def test_low_confidence_goes_to_review() -> None:
    draft = classify_transition(
        view("18 oz", "510.29", "4.29"), view("16.4 oz", "464.93", "4.29", confidence=0.5)
    )
    assert draft is not None
    assert draft.kind == KIND_SHRINK
    assert draft.status == STATUS_REVIEW


def test_implausible_jump_goes_to_review() -> None:
    draft = classify_transition(view("18 oz", "510.29", "4.29"), view("1 oz", "28.35", "4.29"))
    assert draft is not None
    assert draft.status == STATUS_REVIEW


def test_unreadable_size_change() -> None:
    draft = classify_transition(view("18 oz", "510.29", "4.29"), view("family size", None, "4.29"))
    assert draft is not None
    assert draft.kind == KIND_UNREADABLE
    assert draft.status == STATUS_REVIEW


def test_unit_mismatch_treated_as_unreadable() -> None:
    before = view("16 oz", "453.59", "3.00")
    after = view("16 fl oz", "473.18", "3.00", unit="ml")
    draft = classify_transition(before, after)
    assert draft is not None
    assert draft.kind == KIND_UNREADABLE
