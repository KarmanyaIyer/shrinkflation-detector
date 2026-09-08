"""Model-backed size parsing for labels the rules cannot read.

The model only transcribes what the label says and decides whether a multipack amount is per
unit or for the whole package. Unit conversion and multiplication happen here in code, so the
arithmetic never depends on the model.
"""

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from shrinkflation.llm.client import LlmCallRecord, LlmClient
from shrinkflation.sizes.schema import BASE_UNIT_FOR_KIND, Component, MeasureKind, ParsedSize
from shrinkflation.sizes.units import UNITS, canonical_unit, display_count_word

SYSTEM_PROMPT = """You read package size information from grocery store listings and return it as JSON.

Input: the listing's size text and the product name. Output: one JSON object with exactly these keys:
- "measure_kind": one of "weight", "volume", "count", "length", "area", "unknown"
- "label_quantity": the main amount as written, as a number, or null
- "label_unit": its unit as written, lowercase, for example "oz", "fl oz", "lb", "gal", "qt", "l", "ml", "g", "kg", "ct", "rolls", "sheets", "ft", "sq ft"; or null
- "pack_count": how many individual units the package contains when the listing states a count next to a weight or volume, or null
- "label_scope": when pack_count is set, "per_unit" if label_quantity is the amount of one unit, or "total" if it is the amount of the whole package; otherwise null
- "components": other quantities on the label as {"name": string, "quantity": number, "unit": string}, for example sheets per roll; use [] when there are none
- "confidence": number from 0 to 1
- "notes": one short sentence when something is ambiguous, otherwise null

Deciding label_scope. Listings write "6 ct / 18 oz" both for six items weighing 18 oz together and for six items of 18 oz each. Use the product to decide:
- Drinks in cans, bottles, boxes, or pouches, and items also sold singly such as toothpaste, deodorant, shampoo, canned tuna, boxed dinners, and yogurt cups: the amount is usually per unit. Examples: "12 pk / 12 fl oz" soda cans, "4 ct / 5 oz" tuna, "2 ct / 3.4 oz" toothpaste, "6 ct / 1.93 fl oz" ice cream bars.
- Bread, bagels, buns, muffins, tortillas, eggs, waffles, sausage links, tea bags, cocoa packets, granola bars, fruit snacks, toaster pastries, cheese slices, butter sticks, wipes, and tissues, which are packed together in one bag or box: the amount is usually the total. Examples: "6 ct / 18 oz" bagels, "12 ct / 24 oz" eggs, "20 ct / 1.73 oz" tea bags, "40 ct / 32 oz" fruit snacks, "8 ct / 11 oz" hot cocoa mix.
- Check plausibility of the per-unit amount: a bagel is about 3 oz, an egg about 2 oz, a tea bag under 0.1 oz, a granola bar 1 to 1.5 oz, a soda can 12 fl oz, a yogurt cup 4 to 6 oz, a hamburger bun 1.5 to 2.5 oz, a butter stick 4 oz. Choose the scope that gives a plausible per-unit amount.
- If the product name states a total or a per-unit amount, use it.
- Set confidence to 0.7 or lower when both readings stay plausible.

Other rules:
- "oz" is weight and "fl oz" is volume. Do not convert units.
- When the size text is missing or is only a count like "1 ct" or "each", use a size stated in the product name if there is one. Otherwise return measure_kind "unknown" with null quantities and confidence below 0.5.
- Never invent a size that is not in the size text or the product name.
"""


class LlmSizeReading(BaseModel):
    """What the model is asked to return. Deliberately free of unit arithmetic."""

    model_config = ConfigDict(extra="forbid")

    measure_kind: MeasureKind
    label_quantity: Decimal | None = Field(default=None, gt=0)
    label_unit: str | None = Field(default=None, max_length=24)
    pack_count: int | None = Field(default=None, ge=1, le=1000)
    label_scope: Literal["per_unit", "total"] | None = None
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
    notes = reading.notes
    if kind is not reading.measure_kind:
        confidence = min(confidence, 0.6)
        notes = f"model said {reading.measure_kind}, unit implies {kind}" + (
            f"; {notes}" if notes else ""
        )

    pack = reading.pack_count
    unit_quantity: Decimal | None = None
    total = reading.label_quantity
    if pack and pack > 1:
        if reading.label_scope == "per_unit":
            unit_quantity = reading.label_quantity
            total = reading.label_quantity * pack
        else:
            unit_quantity = (reading.label_quantity / pack).quantize(Decimal("0.0001"))
            if reading.label_scope is None:
                confidence = min(confidence, 0.6)
                notes = "scope of the amount not stated" + (f"; {notes}" if notes else "")

    if canon in {"count", "dozen"}:
        display_unit = display_count_word(reading.label_unit or canon)
    else:
        display_unit = canon
    return ParsedSize(
        measure_kind=kind,
        quantity=(total * factor).quantize(Decimal("0.0001")),
        base_unit=BASE_UNIT_FOR_KIND[kind],
        display_quantity=total.quantize(Decimal("0.0001")).normalize(),
        display_unit=display_unit,
        pack_count=pack,
        unit_quantity=unit_quantity.normalize() if unit_quantity else None,
        components=reading.components,
        confidence=confidence,
        method="llm",
        model=model,
        notes=notes,
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
