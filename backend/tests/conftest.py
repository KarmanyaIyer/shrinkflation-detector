"""Shared fixtures. Integration tests run against a real Postgres database named by
TEST_DATABASE_URL (default: the local compose instance, database shrink_test). The database is
created if missing and its tables are rebuilt from the models at the start of the session.
"""

import os
from collections.abc import Iterator
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://shrink:shrink@localhost:5432/shrink_test"
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["OTEL_EXPORTER_OTLP_ENDPOINT"] = ""
os.environ["KROGER_LOCATION_ID"] = "00000000"
os.environ["KROGER_LOCATION_LABEL"] = "a test store"
os.environ["VISITOR_HASH_SALT"] = "test-salt"
os.environ.setdefault("DEEPSEEK_API_KEY", "test-key")
os.environ.setdefault("KROGER_CLIENT_ID", "test-id")
os.environ.setdefault("KROGER_CLIENT_SECRET", "test-secret")

import pytest  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from shrinkflation.db.models import Base, Product  # noqa: E402
from shrinkflation.db.session import get_engine, get_session_factory  # noqa: E402
from shrinkflation.kroger.models import KrogerProduct  # noqa: E402
from shrinkflation.pipeline.observe import observe_product  # noqa: E402

LOCATION_ID = "00000000"
DAY1 = datetime(2026, 9, 1, 12, tzinfo=UTC)
DAY2 = datetime(2026, 9, 2, 12, tzinfo=UTC)
DAY3 = datetime(2026, 9, 3, 12, tzinfo=UTC)


def _ensure_database() -> None:
    url = TEST_DATABASE_URL
    name = url.rsplit("/", 1)[-1]
    admin = create_engine(url.rsplit("/", 1)[0] + "/postgres", isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        exists = conn.execute(
            text("select 1 from pg_database where datname = :name"), {"name": name}
        ).scalar()
        if not exists:
            conn.execute(text(f'create database "{name}"'))
    admin.dispose()


@pytest.fixture(scope="session", autouse=True)
def database() -> Iterator[None]:
    _ensure_database()
    engine = get_engine()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    engine.dispose()


@pytest.fixture
def db() -> Iterator[Session]:
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.rollback()
        session.close()
        tables = ", ".join(table.name for table in Base.metadata.sorted_tables)
        with get_engine().begin() as conn:
            conn.execute(text(f"truncate {tables} restart identity cascade"))


def reading(
    product_id: str,
    description: str,
    size: str | None,
    price: str | None,
    *,
    brand: str | None = "Kroger",
    promo: str = "0",
    sold_by: str = "UNIT",
    categories: list[str] | None = None,
) -> KrogerProduct:
    payload: dict[str, Any] = {
        "productId": product_id,
        "upc": product_id,
        "brand": brand,
        "description": description,
        "categories": categories or ["Test"],
        "images": [
            {
                "perspective": "front",
                "default": True,
                "sizes": [{"size": "medium", "url": f"https://img.example/{product_id}.jpg"}],
            }
        ],
        "items": [
            {
                "itemId": product_id,
                "size": size,
                "soldBy": sold_by,
                "price": {"regular": price, "promo": promo} if price is not None else None,
            }
        ],
    }
    return KrogerProduct.model_validate(payload)


def new_product(
    db: Session,
    product_id: str,
    description: str,
    category: str,
    *,
    brand: str | None = "Kroger",
    seen_at: datetime = DAY1,
) -> Product:
    product = Product(
        id=product_id,
        upc=product_id,
        brand=brand,
        description=description,
        category=category,
        retailer_categories=[category],
        search_terms=[category.lower()],
        image_url=None,
        active=True,
        first_seen_at=seen_at,
        last_seen_at=seen_at,
    )
    db.add(product)
    db.flush()
    return product


def observe(
    db: Session,
    product: Product,
    size: str | None,
    price: str | None,
    at: datetime,
    *,
    description: str | None = None,
    promo: str = "0",
):
    return observe_product(
        db,
        product,
        reading(product.id, description or product.description, size, price, promo=promo),
        location_id=LOCATION_ID,
        now=at,
        llm=None,
    )


def seed_catalog(db: Session) -> None:
    """Two products: one that shrank between DAY1 and DAY3, one unchanged."""
    cereal = new_product(
        db,
        "0001600012479",
        "General Mills Honey Nut Cheerios Cereal",
        "Cereal and breakfast",
        brand="Cheerios",
    )
    observe(db, cereal, "12 oz", "4.29", DAY1)
    observe(db, cereal, "10.8 oz", "4.29", DAY3)
    milk = new_product(db, "0001111041700", "Kroger 2% Reduced Fat Milk", "Dairy and eggs")
    observe(db, milk, "1 gal", "3.19", DAY1)
    observe(db, milk, "1 gal", "3.19", DAY2)
    db.commit()


__all__ = ["DAY1", "DAY2", "DAY3", "Decimal", "new_product", "observe", "reading", "seed_catalog"]
