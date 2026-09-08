"""Model-backed size parsing for labels the rules cannot read.

The model transcribes what the label says and, for multipacks, estimates how much one item of
the product usually weighs or holds. Unit conversion, multiplication, and the decision between
"per item" and "whole package" happen here in code, so the arithmetic never depends on the model.
"""

import math
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from shrinkflation.llm.client import LlmCallRecord, LlmClient
from shrinkflation.sizes.schema import (
    BASE_UNIT_FOR_KIND,
    Component,
    MeasureKind,
    ParsedSize,
    clean_decimal,
)
from shrinkflation.sizes.units import UNITS, canonical_unit, display_count_word

SYSTEM_PROMPT = """You read package size information from grocery store listings and return it as JSON.

Input: the listing's size text and the product name. Output: one JSON object with exactly these keys:
- "measure_kind": one of "weight", "volume", "count", "length", "area", "unknown"
- "label_quantity": the main amount as written, as a number, or null
- "label_unit": its unit as written, lowercase, for example "oz", "fl oz", "lb", "gal", "qt", "l", "ml", "g", "kg", "ct", "rolls", "sheets", "ft", "sq ft"; or null
- "pack_count": how many individual items or inner packs the package contains when the listing states a count next to the main amount, or null
- "label_scope": when pack_count is set, "per_unit" if label_quantity is the amount of one item, or "total" if it is the amount of the whole package; otherwise null
- "typical_unit_quantity": when pack_count is set and the measure is weight or volume, your estimate from general knowledge of how much one item of this product weighs or holds, as a number in label_unit; otherwise null
- "components": other quantities on the label as {"name": string, "quantity": number, "unit": string}, for example sheets per roll; use [] when there are none
- "confidence": number from 0 to 1
- "notes": one short sentence when something is ambiguous, otherwise null

Listings write "6 ct / 18 oz" both for six items weighing 18 oz together and for six items of 18 oz each, so typical_unit_quantity matters. Estimate the single item, not the package: a soda can holds 12 fl oz, a bagel weighs about 3 oz, a hamburger bun about 2 oz, an egg about 2 oz, a tea bag about 0.08 oz, a fruit snack pouch about 0.8 oz, a granola bar about 1.2 oz, a single-serve chip or cracker bag about 1 oz, a toothpaste tube about 3.5 oz, a yogurt cup about 5.3 oz, a butter stick 4 oz, an ice cream bar about 3 fl oz and a mini bar about 1 fl oz, an instant noodle pack about 3 oz.

Other rules:
- "oz" is weight and "fl oz" is volume. Do not convert units.
- When the size text is missing or is only a count like "1 ct" or "each", use a size stated in the product name if there is one. Otherwise return measure_kind "unknown" with null quantities and confidence below 0.5.
- Never invent a size that is not in the size text or the product name.
"""

# Both readings count as plausible when each implied item amount is within this factor of the
# model's typical item estimate.
AMBIGUITY_FACTOR = 1.5


class LlmSizeReading(BaseModel):
    """What the model is asked to return. Deliberately free of unit arithmetic."""

    model_config = ConfigDict(extra="forbid")

    measure_kind: MeasureKind
    label_quantity: Decimal | None = Field(default=None, gt=0)
    label_unit: str | None = Field(default=None, max_length=24)
    pack_count: int | None = Field(default=None, ge=1, le=1000)
    label_scope: Literal["per_unit", "total"] | None = None
    typical_unit_quantity: Decimal | None = Field(default=None, gt=0)
    components: list[Component] = Field(default_factory=list, max_length=6)
    confidence: float = Field(ge=0, le=1)
    notes: str | None = Field(default=None, max_length=300)

    @field_validator("label_unit")
    @classmethod
    def strip_unit(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip().lower()
        return value or None


def build_user_prompt(size_text: str | None, description: str) -> str:
    return f'Size text: "{size_text or ""}"\nProduct name: "{description}"\nReturn the JSON object.'


def _choose_scope(
    reading: LlmSizeReading, kind: MeasureKind, pack: int
) -> tuple[Literal["per_unit", "total"], float | None, str | None]:
    """Decide what the label amount refers to. Returns (scope, confidence cap, note)."""
    if kind is MeasureKind.COUNT:
        # "4 pk / 120 ct" always means 120 per pack.
        return "per_unit", None, None
    label_quantity = reading.label_quantity
    typical = reading.typical_unit_quantity
    assert label_quantity is not None
    if typical is None:
        if reading.label_scope is None:
            return "total", 0.6, "scope of the amount not stated"
        return reading.label_scope, 0.8, None

    implied = {
        "per_unit": float(label_quantity),
        "total": float(label_quantity) / pack,
    }
    distance = {scope: abs(math.log(amount / float(typical))) for scope, amount in implied.items()}
    both_plausible = all(d <= math.log(AMBIGUITY_FACTOR) for d in distance.values())
    if both_plausible:
        scope = reading.label_scope or "total"
        return scope, 0.7, "both per item and total readings are plausible"
    best: Literal["per_unit", "total"] = (
        "per_unit" if distance["per_unit"] <= distance["total"] else "total"
    )
    if reading.label_scope is not None and best != reading.label_scope:
        return best, 0.8, f"model said {reading.label_scope}, typical item size implies {best}"
    return best, None, None


def reading_to_parsed(reading: LlmSizeReading, model: str) -> ParsedSize:
    """Convert the model's transcription into a ParsedSize with a computed base quantity."""
    canon = canonical_unit(reading.label_unit) if reading.label_unit else None
    if reading.label_quantity is None or canon is None:
        return ParsedSize(
            measure_kind=MeasureKind.UNKNOWN,
            components=reading.components,
            confidence=min(reading.confidence, 0.4),
            method="llm",
            model=model,
            notes=reading.notes or ("unit not recognized" if reading.label_unit else None),
        )
    kind, factor = UNITS[canon]
    confidence = reading.confidence
    notes: list[str] = [reading.notes] if reading.notes else []
    if kind is not reading.measure_kind:
        confidence = min(confidence, 0.6)
        notes.insert(0, f"model said {reading.measure_kind}, unit implies {kind}")

    pack = reading.pack_count
    unit_quantity: Decimal | None = None
    total = reading.label_quantity
    if pack and pack > 1:
        scope, cap, note = _choose_scope(reading, kind, pack)
        if cap is not None:
            confidence = min(confidence, cap)
        if note:
            notes.insert(0, note)
        if scope == "per_unit":
            unit_quantity = reading.label_quantity
            total = reading.label_quantity * pack
        else:
            unit_quantity = reading.label_quantity / pack

    if canon in {"count", "dozen"}:
        display_unit = display_count_word(reading.label_unit or canon)
    else:
        display_unit = canon
    return ParsedSize(
        measure_kind=kind,
        quantity=(total * factor).quantize(Decimal("0.0001")),
        base_unit=BASE_UNIT_FOR_KIND[kind],
        display_quantity=clean_decimal(total),
        display_unit=display_unit,
        pack_count=pack,
        unit_quantity=clean_decimal(unit_quantity) if unit_quantity is not None else None,
        components=reading.components,
        confidence=confidence,
        method="llm",
        model=model,
        notes="; ".join(notes) or None,
    )


def parse_with_llm(
    client: LlmClient,
    size_text: str | None,
    description: str,
    *,
    model: str | None = None,
    pipeline_run_id: int | None = None,
) -> tuple[ParsedSize, list[LlmCallRecord]]:
    model = model or client.fast_model
    reading, records = client.complete_json(
        purpose="size_parse",
        system=SYSTEM_PROMPT,
        user=build_user_prompt(size_text, description),
        schema=LlmSizeReading,
        model=model,
        max_tokens=400,
        pipeline_run_id=pipeline_run_id,
    )
    return reading_to_parsed(reading, model), records
