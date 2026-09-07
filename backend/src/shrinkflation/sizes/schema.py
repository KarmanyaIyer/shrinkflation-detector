from decimal import Decimal
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

BaseUnit = Literal["g", "ml", "count", "m", "m2"]


class MeasureKind(StrEnum):
    WEIGHT = "weight"
    VOLUME = "volume"
    COUNT = "count"
    LENGTH = "length"
    AREA = "area"
    UNKNOWN = "unknown"


BASE_UNIT_FOR_KIND: dict[MeasureKind, BaseUnit] = {
    MeasureKind.WEIGHT: "g",
    MeasureKind.VOLUME: "ml",
    MeasureKind.COUNT: "count",
    MeasureKind.LENGTH: "m",
    MeasureKind.AREA: "m2",
}


class Component(BaseModel):
    """A secondary quantity stated on the label, such as sheets per roll."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(max_length=40, description="What is counted, for example 'sheets per roll'")
    quantity: Decimal = Field(gt=0)
    unit: str = Field(max_length=16)


class ParsedSize(BaseModel):
    """Structured reading of a package size string.

    quantity is the total amount of product in base_unit. For a multipack it already includes
    the pack count (12 x 12 fl oz gives quantity 4258.19 ml). display fields keep the label's
    own unit so the site can show '16.4 oz' rather than '464.93 g'.
    """

    model_config = ConfigDict(extra="forbid")

    measure_kind: MeasureKind
    quantity: Decimal | None = Field(default=None, gt=0)
    base_unit: BaseUnit | None = None
    display_quantity: Decimal | None = Field(default=None, gt=0)
    display_unit: str | None = Field(default=None, max_length=16)
    pack_count: int | None = Field(default=None, ge=1, le=1000)
    unit_quantity: Decimal | None = Field(
        default=None, gt=0, description="Amount per pack unit, in display_unit"
    )
    components: list[Component] = Field(default_factory=list, max_length=6)
    confidence: float = Field(ge=0, le=1)
    method: Literal["rule", "llm"] = "rule"
    model: str | None = None
    notes: str | None = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def check_consistency(self) -> "ParsedSize":
        if self.measure_kind is MeasureKind.UNKNOWN:
            if self.quantity is not None or self.base_unit is not None:
                raise ValueError("unknown measure kind cannot carry a quantity")
            return self
        expected = BASE_UNIT_FOR_KIND[self.measure_kind]
        if self.base_unit != expected:
            raise ValueError(f"base_unit must be {expected} for {self.measure_kind}")
        if self.quantity is None:
            raise ValueError("quantity is required when measure_kind is known")
        return self

    @property
    def comparable(self) -> bool:
        return self.measure_kind is not MeasureKind.UNKNOWN and self.quantity is not None
