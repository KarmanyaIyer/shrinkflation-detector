"""Model-backed size parsing for labels the rules cannot read.

The model only transcribes what the label says (amount, unit, pack structure). Unit conversion
to a base unit is done here in code, so arithmetic never depends on the model.
"""

from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from shrinkflation.llm.client import LlmCallRecord, LlmClient
from shrinkflation.sizes.schema import BASE_UNIT_FOR_KIND, Component, MeasureKind, ParsedSize
from shrinkflation.sizes.units import UNITS, canonical_unit

SYSTEM_PROMPT = """You read package size information from grocery store listings and return it as JSON.

Input: the listing's size text and the product name. Output: one JSON object with exactly these keys:
- "measure_kind": one of "weight", "volume", "count", "length", "area", "unknown"
- "display_quantity": total amount for the whole package as a number in display_unit, or null
- "display_unit": the unit as written on the label, lowercase, for example "oz", "fl oz", "lb", "gal", "qt", "l", "ml", "g", "kg", "ct", "rolls", "sheets", "ft", "sq ft"; or null
- "pack_count": number of individual units in a multipack, or null when it is not a multipack
- "unit_quantity": amount per individual unit in display_unit for a multipack, or null
- "components": list of additional label quantities as {"name": string, "quantity": number, "unit": string}, for example sheets per roll; use [] when there are none
- "confidence": number from 0 to 1
- "notes": one short sentence when something is ambiguous, otherwise null

Rules:
- display_quantity is the total for the whole package. For "12 x 12 fl oz" it is 144, with pack_count 12 and unit_quantity 12.
- When a listing gives both a count and a weight or volume, use the weight or volume as the main measure and put the count in pack_count or components.
- "oz" is weight and "fl oz" is volume. Do not convert units.
- When the size text is missing or is only a count like "1 ct" or "each", use a size stated in the product name if there is one. Otherwise return measure_kind "unknown" with null quantities and confidence below 0.5.
- Never invent a size that is not in the input.
"""


class LlmSizeReading(BaseModel):
    """What the model is asked to return. Deliberately free of unit arithmetic."""

    model_config = ConfigDict(extra="forbid")

    measure_kind: MeasureKind
    display_quantity: Decimal | None = Field(default=None, gt=0)
    display_unit: str | None = Field(default=None, max_length=24)
    pack_count: int | None = Field(default=None, ge=1, le=1000)
    unit_quantity: Decimal | None = Field(default=None, gt=0)
    components: list[Component] = Field(default_factory=list, max_length=6)
    confidence: float = Field(ge=0, le=1)
    notes: str | None = Field(default=None, max_length=300)

    @field_validator("display_unit")
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
    canon = canonical_unit(reading.display_unit) if reading.display_unit else None
    if reading.display_quantity is None or canon is None:
        return ParsedSize(
            measure_kind=MeasureKind.UNKNOWN,
            components=reading.components,
            confidence=min(reading.confidence, 0.4),
            method="llm",
            model=model,
            notes=reading.notes or ("unit not recognized" if reading.display_unit else None),
        )
    kind, factor = UNITS[canon]
    confidence = reading.confidence
    notes = reading.notes
    if kind is not reading.measure_kind:
        confidence = min(confidence, 0.6)
        notes = f"model said {reading.measure_kind}, unit implies {kind}" + (
            f"; {notes}" if notes else ""
        )
    display_unit = canon if canon not in {"count", "dozen"} else (reading.display_unit or canon)
    return ParsedSize(
        measure_kind=kind,
        quantity=(reading.display_quantity * factor).quantize(Decimal("0.0001")),
        base_unit=BASE_UNIT_FOR_KIND[kind],
        display_quantity=reading.display_quantity.normalize(),
        display_unit=display_unit,
        pack_count=reading.pack_count,
        unit_quantity=reading.unit_quantity.normalize() if reading.unit_quantity else None,
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
