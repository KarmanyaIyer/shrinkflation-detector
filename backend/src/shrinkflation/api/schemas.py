"""Response models for the public API."""

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UnitPrice(ApiModel):
    value: Decimal = Field(description="Price per display unit, in dollars")
    unit: str = Field(description="Unit the price is per, for example oz, fl oz, each")


class SnapshotOut(ApiModel):
    id: int
    size_text: str
    display_quantity: Decimal | None = None
    display_unit: str | None = None
    quantity: Decimal | None = None
    base_unit: str | None = None
    price_regular: Decimal | None = None
    price_promo: Decimal | None = None
    unit_price: UnitPrice | None = None
    first_seen_at: datetime
    last_seen_at: datetime
    observations: int
    parse_method: str | None = None
    parse_confidence: float | None = None


class ProductSummary(ApiModel):
    id: str
    description: str
    brand: str | None = None
    category: str
    image_url: str | None = None


class ChangeOut(ApiModel):
    id: int
    kind: str
    source: str
    product: ProductSummary
    before: SnapshotOut | None = None
    after: SnapshotOut | None = None
    size_change_pct: Decimal | None = None
    price_change_pct: Decimal | None = None
    unit_price_change_pct: Decimal | None = None
    before_seen_at: datetime | None = None
    after_seen_at: datetime | None = None
    detected_at: datetime
    note: str | None = None


class ChangeList(ApiModel):
    items: list[ChangeOut]
    total: int
    limit: int
    offset: int


class ProductDetail(ApiModel):
    product: ProductSummary
    upc: str | None = None
    retailer_categories: list[str] = Field(default_factory=list)
    active: bool
    first_seen_at: datetime
    last_seen_at: datetime
    current: SnapshotOut | None = None
    snapshots: list[SnapshotOut]
    changes: list[ChangeOut]


class ProductSearchResult(ApiModel):
    items: list[ProductSummary]


class CategoryCount(ApiModel):
    category: str
    products: int
    changes: int


class LastRun(ApiModel):
    id: int
    kind: str
    status: str
    started_at: datetime
    finished_at: datetime | None = None
    products_checked: int
    snapshots_added: int
    changes_found: int
    api_calls: int
    errors: int


class Stats(ApiModel):
    products_tracked: int
    categories: int
    snapshots: int
    changes_published: int
    shrink_count: int
    grow_count: int
    price_increase_count: int
    llm_calls: int
    llm_cost_usd: Decimal
    tracking_since: datetime | None = None
    last_run: LastRun | None = None
    location_label: str


class Health(ApiModel):
    status: str
    database: str
    last_run_finished_at: datetime | None = None
    detail: dict[str, Any] = Field(default_factory=dict)
