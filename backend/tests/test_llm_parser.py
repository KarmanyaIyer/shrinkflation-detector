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
        "typical_unit_quantity": Decimal("3"),
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
    assert parsed.notes is None


def test_per_unit_scope_multiplies_by_pack_count() -> None:
    parsed = reading_to_parsed(
        _reading(
            measure_kind=MeasureKind.VOLUME,
            label_quantity=Decimal("12"),
            label_unit="fl oz",
            pack_count=12,
            label_scope="per_unit",
            typical_unit_quantity=Decimal("12"),
        ),
        "m",
    )
    assert parsed.display_quantity == Decimal("144")
    assert parsed.unit_quantity == Decimal("12")
    assert parsed.quantity == Decimal("4258.5883")


def test_typical_item_size_overrides_model_scope() -> None:
    # "10 ct / 0.8 oz" fruit snacks: the model said total, but a pouch weighs about 0.8 oz.
    parsed = reading_to_parsed(
        _reading(
            label_quantity=Decimal("0.8"),
            pack_count=10,
            label_scope="total",
            typical_unit_quantity=Decimal("0.8"),
        ),
        "m",
    )
    assert parsed.display_quantity == Decimal("8")
    assert parsed.unit_quantity == Decimal("0.8")
    assert parsed.confidence <= 0.8
    assert parsed.notes is not None and "implies per_unit" in parsed.notes


def test_both_readings_plausible_lowers_confidence() -> None:
    parsed = reading_to_parsed(
        _reading(
            label_quantity=Decimal("4"),
            pack_count=2,
            label_scope="per_unit",
            typical_unit_quantity=Decimal("2.9"),
        ),
        "m",
    )
    assert parsed.display_quantity == Decimal("8")
    assert parsed.confidence <= 0.7


def test_count_unit_with_pack_is_always_per_pack() -> None:
    parsed = reading_to_parsed(
        _reading(
            measure_kind=MeasureKind.COUNT,
            label_quantity=Decimal("120"),
            label_unit="ct",
            pack_count=4,
            label_scope="total",
            typical_unit_quantity=None,
        ),
        "m",
    )
    assert parsed.display_quantity == Decimal("480")
    assert parsed.unit_quantity == Decimal("120")
    assert parsed.display_unit == "ct"
    assert parsed.confidence == 0.9


def test_missing_scope_and_estimate_lowers_confidence() -> None:
    parsed = reading_to_parsed(_reading(label_scope=None, typical_unit_quantity=None), "m")
    assert parsed.display_quantity == Decimal("18")
    assert parsed.confidence <= 0.6
    assert parsed.notes is not None and parsed.notes.startswith("scope")


def test_unit_kind_mismatch_lowers_confidence() -> None:
    parsed = reading_to_parsed(
        _reading(
            measure_kind=MeasureKind.VOLUME,
            pack_count=None,
            label_scope=None,
            typical_unit_quantity=None,
        ),
        "m",
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
            typical_unit_quantity=None,
        ),
        "m",
    )
    assert parsed.display_unit == "rolls"
    assert parsed.quantity == Decimal("8.0000")


def test_whole_numbers_are_not_written_in_exponent_form() -> None:
    parsed = reading_to_parsed(
        _reading(
            measure_kind=MeasureKind.VOLUME,
            label_quantity=Decimal("20"),
            label_unit="fl oz",
            pack_count=8,
            label_scope="per_unit",
            typical_unit_quantity=Decimal("20"),
        ),
        "m",
    )
    assert str(parsed.display_quantity) == "160"
    assert str(parsed.unit_quantity) == "20"
