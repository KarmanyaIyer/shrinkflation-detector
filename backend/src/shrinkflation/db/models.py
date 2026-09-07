from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Product(Base):
    """A retailer catalog entry that the pipeline tracks. The id is the Kroger product id."""

    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    upc: Mapped[str | None] = mapped_column(String(32), index=True)
    brand: Mapped[str | None] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(80), index=True)
    retailer_categories: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    search_terms: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    image_url: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    snapshots: Mapped[list["Snapshot"]] = relationship(
        back_populates="product", order_by="Snapshot.first_seen_at"
    )
    changes: Mapped[list["Change"]] = relationship(back_populates="product")


class Snapshot(Base):
    """One run of identical observed state (size text, regular price, name) for a product.

    A new row is written only when that state changes, so a product with no changes has one
    snapshot whose last_seen_at advances every day. Two consecutive snapshots are the evidence
    for a change.
    """

    __tablename__ = "snapshots"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    product_id: Mapped[str] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    location_id: Mapped[str] = mapped_column(String(16))
    size_text: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    sold_by: Mapped[str | None] = mapped_column(String(16))
    price_regular: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    price_promo: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    size_parse_id: Mapped[int | None] = mapped_column(ForeignKey("size_parses.id"), index=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    observations: Mapped[int] = mapped_column(Integer, default=1)
    raw: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)

    product: Mapped[Product] = relationship(back_populates="snapshots")
    size_parse: Mapped["SizeParse | None"] = relationship()

    __table_args__ = (Index("ix_snapshots_product_last_seen", "product_id", "last_seen_at"),)


class SizeParse(Base):
    """Structured reading of a size string, cached by (size_text, description).

    quantity is the total amount in base_unit (g, ml, count, m, m2). The full validated
    Pydantic payload is kept in data.
    """

    __tablename__ = "size_parses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    size_text: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    measure_kind: Mapped[str] = mapped_column(String(16))
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    base_unit: Mapped[str | None] = mapped_column(String(8))
    display_quantity: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    display_unit: Mapped[str | None] = mapped_column(String(16))
    pack_count: Mapped[int | None] = mapped_column(Integer)
    confidence: Mapped[Decimal] = mapped_column(Numeric(3, 2))
    method: Mapped[str] = mapped_column(String(16))
    model: Mapped[str | None] = mapped_column(String(64))
    data: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("ux_size_parses_text_desc", "size_text", "description", unique=True),)


class Change(Base):
    """A detected transition between two consecutive snapshots of one product."""

    __tablename__ = "changes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[str] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(32), index=True)
    source: Mapped[str] = mapped_column(String(16), default="kroger")
    status: Mapped[str] = mapped_column(String(16), default="published", index=True)
    before_snapshot_id: Mapped[int | None] = mapped_column(ForeignKey("snapshots.id"))
    after_snapshot_id: Mapped[int | None] = mapped_column(ForeignKey("snapshots.id"))
    base_unit: Mapped[str | None] = mapped_column(String(8))
    before_quantity: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    after_quantity: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    before_size_text: Mapped[str | None] = mapped_column(String(120))
    after_size_text: Mapped[str | None] = mapped_column(String(120))
    before_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    after_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    size_change_pct: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    price_change_pct: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    unit_price_change_pct: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    before_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    after_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    evidence: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    note: Mapped[str | None] = mapped_column(Text)

    product: Mapped[Product] = relationship(back_populates="changes")
    before_snapshot: Mapped["Snapshot | None"] = relationship(foreign_keys=[before_snapshot_id])
    after_snapshot: Mapped["Snapshot | None"] = relationship(foreign_keys=[after_snapshot_id])

    __table_args__ = (
        Index(
            "ux_changes_transition",
            "product_id",
            "before_snapshot_id",
            "after_snapshot_id",
            unique=True,
        ),
    )


class PipelineRun(Base):
    __tablename__ = "pipeline_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16), default="running")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    products_checked: Mapped[int] = mapped_column(Integer, default=0)
    snapshots_added: Mapped[int] = mapped_column(Integer, default=0)
    changes_found: Mapped[int] = mapped_column(Integer, default=0)
    api_calls: Mapped[int] = mapped_column(Integer, default=0)
    llm_calls: Mapped[int] = mapped_column(Integer, default=0)
    llm_cost_usd: Mapped[Decimal] = mapped_column(Numeric(10, 5), default=0)
    errors: Mapped[int] = mapped_column(Integer, default=0)
    error_sample: Mapped[str | None] = mapped_column(Text)
    meta: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)


class LlmCall(Base):
    """One request to the model provider. Written for every call, success or failure."""

    __tablename__ = "llm_calls"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    purpose: Mapped[str] = mapped_column(String(32), index=True)
    model: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16))
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cached_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[Decimal] = mapped_column(Numeric(10, 6), default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    trace_id: Mapped[str | None] = mapped_column(String(32), index=True)
    span_id: Mapped[str | None] = mapped_column(String(16))
    pipeline_run_id: Mapped[int | None] = mapped_column(ForeignKey("pipeline_runs.id"))
    error: Mapped[str | None] = mapped_column(Text)


class VisitorBudget(Base):
    """Daily question count per anonymized visitor. The key is a salted hash, never an IP."""

    __tablename__ = "visitor_budgets"

    visitor_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    questions_used: Mapped[int] = mapped_column(Integer, default=0)
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AskLog(Base):
    """Record of each agent question for abuse review and quality checks."""

    __tablename__ = "ask_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    visitor_key: Mapped[str] = mapped_column(String(64), index=True)
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str | None] = mapped_column(Text)
    tool_calls: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    model: Mapped[str | None] = mapped_column(String(64))
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    trace_id: Mapped[str | None] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16), default="ok")
