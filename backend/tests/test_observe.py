from datetime import timedelta
from decimal import Decimal

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from shrinkflation.db.models import Change, PipelineRun, Product, Snapshot
from shrinkflation.pipeline.refresh import run_refresh
from tests.conftest import DAY1, DAY2, DAY3, new_product, observe, reading


def test_repeat_observation_extends_the_snapshot(db: Session) -> None:
    product = new_product(db, "1000000000001", "Test Crackers", "Snacks")
    first = observe(db, product, "12 oz", "3.99", DAY1)
    second = observe(db, product, "12 oz", "3.99", DAY2)

    assert first.snapshot_added and first.change is None
    assert not second.snapshot_added and second.change is None
    snapshots = db.execute(select(Snapshot)).scalars().all()
    assert len(snapshots) == 1
    assert snapshots[0].observations == 2
    assert snapshots[0].first_seen_at == DAY1
    assert snapshots[0].last_seen_at == DAY2
    assert product.last_seen_at == DAY2
    assert snapshots[0].size_parse is not None
    assert snapshots[0].size_parse.method == "rule"


def test_smaller_package_at_same_price_is_a_published_shrink(db: Session) -> None:
    product = new_product(db, "1000000000002", "Test Cereal", "Cereal and breakfast")
    observe(db, product, "12 oz", "4.29", DAY1)
    observe(db, product, "12 oz", "4.29", DAY2)
    result = observe(db, product, "10.8 oz", "4.29", DAY3)

    assert result.snapshot_added
    change = result.change
    assert change is not None
    assert change.kind == "shrink"
    assert change.status == "published"
    assert float(change.size_change_pct or 0) == pytest.approx(-10.0, abs=0.01)
    assert float(change.price_change_pct or 0) == pytest.approx(0.0, abs=0.01)
    assert float(change.unit_price_change_pct or 0) == pytest.approx(11.11, abs=0.01)
    assert change.before_size_text == "12 oz" and change.after_size_text == "10.8 oz"
    assert change.before_seen_at == DAY2
    assert change.after_seen_at == DAY3
    assert change.before_snapshot_id != change.after_snapshot_id
    assert db.execute(select(func.count()).select_from(Snapshot)).scalar_one() == 2


def test_price_change_alone_is_a_price_change(db: Session) -> None:
    product = new_product(db, "1000000000003", "Test Juice", "Beverages")
    observe(db, product, "52 fl oz", "3.49", DAY1)
    up = observe(db, product, "52 fl oz", "3.99", DAY2)
    down = observe(db, product, "52 fl oz", "3.29", DAY3)

    assert up.change is not None and up.change.kind == "price_increase"
    assert float(up.change.price_change_pct or 0) == pytest.approx(14.33, abs=0.01)
    assert down.change is not None and down.change.kind == "price_decrease"


def test_same_quantity_written_differently_is_hidden(db: Session) -> None:
    product = new_product(db, "1000000000004", "Test Butter", "Dairy and eggs")
    observe(db, product, "16 oz", "5.49", DAY1)
    result = observe(db, product, "1 lb", "5.49", DAY2)

    assert result.snapshot_added
    assert result.change is not None
    assert result.change.kind == "relabel"
    assert result.change.status == "hidden"


def test_unreadable_size_goes_to_review(db: Session) -> None:
    product = new_product(db, "1000000000005", "Test Wipes", "Baby and pet")
    observe(db, product, "3 pk / 64 ct", "9.99", DAY1)
    result = observe(db, product, "192 ct", "9.99", DAY2)

    assert result.change is not None
    assert result.change.kind == "unreadable_size_change"
    assert result.change.status == "needs_review"


def test_promo_price_does_not_create_a_snapshot(db: Session) -> None:
    product = new_product(db, "1000000000006", "Test Soda", "Beverages")
    observe(db, product, "2 l", "2.49", DAY1)
    result = observe(db, product, "2 l", "2.49", DAY2, promo="1.99")

    assert not result.snapshot_added
    snapshot = db.execute(select(Snapshot)).scalar_one()
    assert snapshot.price_promo == Decimal("1.99")


class FakeKroger:
    def __init__(self, readings) -> None:
        self.readings = readings
        self.calls_made = 0
        self.requested: list[list[str]] = []

    def products_by_ids(self, ids, location_id):
        self.calls_made += 1
        self.requested.append(list(ids))
        return [r for r in self.readings if r.product_id in ids]


def test_refresh_records_changes_and_deactivates_missing_products(db: Session) -> None:
    changed = new_product(db, "2000000000001", "Refresh Cereal", "Cereal and breakfast")
    observe(db, changed, "12 oz", "4.29", DAY1)
    steady = new_product(db, "2000000000002", "Refresh Milk", "Dairy and eggs")
    observe(db, steady, "1 gal", "3.19", DAY1)
    stale = new_product(
        db, "2000000000003", "Gone Product", "Snacks", seen_at=DAY1 - timedelta(days=30)
    )
    observe(db, stale, "8 oz", "2.99", DAY1 - timedelta(days=30))
    db.commit()

    kroger = FakeKroger(
        [
            reading("2000000000001", "Refresh Cereal", "10.8 oz", "4.29"),
            reading("2000000000002", "Refresh Milk", "1 gal", "3.19"),
        ]
    )
    run_id = run_refresh(kroger=kroger, llm=None)  # type: ignore[arg-type]

    run = db.get(PipelineRun, run_id)
    assert run is not None
    assert run.status == "ok"
    assert run.products_checked == 2
    assert run.snapshots_added == 1
    assert run.changes_found == 1
    assert run.api_calls == 1
    assert run.meta["deactivated"] == 1
    assert kroger.requested == [["2000000000001", "2000000000002", "2000000000003"]]

    db.expire_all()
    assert db.get(Product, "2000000000003").active is False  # type: ignore[union-attr]
    change = db.execute(select(Change)).scalar_one()
    assert change.product_id == "2000000000001"
    assert change.kind == "shrink"
