from decimal import Decimal

from shrinkflation.sizes.llm_parser import LlmSizeReading, reading_to_parsed
from shrinkflation.sizes.schema import MeasureKind


def _reading(**overrides: object) -> LlmSizeReading:
    base: dict[str, object] = {
        "measure_kind": MeasureKind.WEIGHT,
        "label_quantity": Decimal("18"),
        "label_unit": "oz",
        "pack_count": 6,
        "label_scope": "total",
        "confidence": 0.9,
    }
    base.update(overrides)
    return LlmSizeReading.model_validate(base)


def test_total_scope_keeps_label_amount_and_derives_per_unit() -> None:
    parsed = reading_to_parsed(_reading(), "m")
    assert parsed.measure_kind is MeasureKind.WEIGHT
    assert parsed.display_quantity == Decimal("18")
    assert parsed.unit_quantity == Decimal("3")
    assert parsed.quantity == Decimal("510.2914")
    assert parsed.pack_count == 6
    assert parsed.confidence == 0.9


def test_per_unit_scope_multiplies_by_pack_count() -> None:
    parsed = reading_to_parsed(
        _reading(
            measure_kind=MeasureKind.VOLUME,
            label_quantity=Decimal("12"),
            label_unit="fl oz",
            pack_count=12,
            label_scope="per_unit",
        ),
        "m",
    )
    assert parsed.display_quantity == Decimal("144")
    assert parsed.unit_quantity == Decimal("12")
    assert parsed.quantity == Decimal("4258.5883")


def test_missing_scope_on_multipack_lowers_confidence() -> None:
    parsed = reading_to_parsed(_reading(label_scope=None), "m")
    assert parsed.confidence <= 0.6
    assert parsed.notes is not None and parsed.notes.startswith("scope")


def test_unit_kind_mismatch_lowers_confidence() -> None:
    parsed = reading_to_parsed(
        _reading(measure_kind=MeasureKind.VOLUME, pack_count=None, label_scope=None), "m"
    )
    assert parsed.measure_kind is MeasureKind.WEIGHT
    assert parsed.confidence <= 0.6


def test_unknown_unit_gives_unknown_kind() -> None:
    parsed = reading_to_parsed(_reading(label_unit="widgets"), "m")
    assert parsed.measure_kind is MeasureKind.UNKNOWN
    assert parsed.quantity is None
    assert parsed.confidence <= 0.4


def test_count_abbreviation_gets_display_word() -> None:
    parsed = reading_to_parsed(
        _reading(
            measure_kind=MeasureKind.COUNT,
            label_quantity=Decimal("8"),
            label_unit="rl",
            pack_count=None,
            label_scope=None,
        ),
        "m",
    )
    assert parsed.display_unit == "rolls"
    assert parsed.quantity == Decimal("8.0000")
