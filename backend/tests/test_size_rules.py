from decimal import Decimal

import pytest

from shrinkflation.sizes import MeasureKind, parse_with_rules
from shrinkflation.sizes.rules import is_ambiguous_multipack


@pytest.mark.parametrize(
    ("text", "kind", "quantity", "display"),
    [
        ("16.4 oz", MeasureKind.WEIGHT, Decimal("464.9322"), "oz"),
        ("1 lb", MeasureKind.WEIGHT, Decimal("453.5924"), "lb"),
        ("2 lbs", MeasureKind.WEIGHT, Decimal("907.1847"), "lb"),
        ("12 fl oz", MeasureKind.VOLUME, Decimal("354.8824"), "fl oz"),
        ("1 gal", MeasureKind.VOLUME, Decimal("3785.4118"), "gal"),
        ("1/2 gal", MeasureKind.VOLUME, Decimal("1892.7059"), "gal"),
        ("1.5 qt", MeasureKind.VOLUME, Decimal("1419.5294"), "qt"),
        ("2 L", MeasureKind.VOLUME, Decimal("2000.0000"), "l"),
        ("750 mL", MeasureKind.VOLUME, Decimal("750.0000"), "ml"),
        ("6 ct", MeasureKind.COUNT, Decimal("6.0000"), "ct"),
        ("12 rolls", MeasureKind.COUNT, Decimal("12.0000"), "rolls"),
        ("1 dozen", MeasureKind.COUNT, Decimal("12.0000"), "dozen"),
        ("each", MeasureKind.COUNT, Decimal("1.0000"), "each"),
        ("500 g", MeasureKind.WEIGHT, Decimal("500.0000"), "g"),
        ("30 fo", MeasureKind.VOLUME, Decimal("887.2059"), "fl oz"),
        ("8 rl", MeasureKind.COUNT, Decimal("8.0000"), "rolls"),
        ("2 lbr", MeasureKind.WEIGHT, Decimal("907.1847"), "lb"),
        (".45 oz", MeasureKind.WEIGHT, Decimal("12.7573"), "oz"),
    ],
)
def test_simple_sizes(text: str, kind: MeasureKind, quantity: Decimal, display: str) -> None:
    parsed = parse_with_rules(text)
    assert parsed is not None, text
    assert parsed.measure_kind is kind
    assert parsed.quantity == quantity
    assert parsed.display_unit == display
    assert parsed.method == "rule"
    assert parsed.pack_count is None


@pytest.mark.parametrize(
    ("text", "pack", "total_ml"),
    [
        ("12 x 12 fl oz", 12, Decimal("4258.5883")),
        ("6 X 16.9 fl oz", 6, Decimal("2998.7559")),
        ("4 × 8 fl oz", 4, Decimal("946.3529")),
    ],
)
def test_multipacks(text: str, pack: int, total_ml: Decimal) -> None:
    parsed = parse_with_rules(text)
    assert parsed is not None, text
    assert parsed.measure_kind is MeasureKind.VOLUME
    assert parsed.pack_count == pack
    assert parsed.quantity == total_ml
    assert parsed.confidence < 1.0


@pytest.mark.parametrize(
    "text",
    [
        "",
        "   ",
        "family size",
        "6 rolls (150 sheets each)",
        "2 lb / 32 oz",
        "12 oz cans 12 pk 24 fl oz",
        "N/A",
    ],
)
def test_unparseable_left_to_llm(text: str) -> None:
    assert parse_with_rules(text) is None


@pytest.mark.parametrize(
    "text",
    [
        "6 - 16.9 fl oz",
        "24 ct / 16.9 fl oz",
        "8 pk / 12 fl oz",
        "6 ct / 18 oz",
        "5.3 oz., 4 pack",
        "1 pk / 120 ct",
        "3 pk / 6 ct",
        "40 pk / .8 oz",
        "4 sticks / 16 oz / 2 pk",
        "12 oz cans 12 pk 24 fl oz",
    ],
)
def test_ambiguous_multipacks_left_to_llm(text: str) -> None:
    assert parse_with_rules(text) is None
    assert is_ambiguous_multipack(text)


@pytest.mark.parametrize(
    "text", ["12 x 12 fl oz", "16 oz", "6 ct", "", "10.8 oz (306g)", "net wt 1 lb 11 oz. (765g)"]
)
def test_not_ambiguous(text: str) -> None:
    assert not is_ambiguous_multipack(text)


def test_commas_are_thousands_separators_only() -> None:
    parsed = parse_with_rules("1,000 ct")
    assert parsed is not None
    assert parsed.measure_kind is MeasureKind.COUNT
    assert parsed.quantity == Decimal("1000.0000")
    assert parsed.confidence == 1.0
    # A comma that is not followed by exactly three digits is not a number the rules accept;
    # the label goes to the model instead of being misread.
    assert parse_with_rules("1,5 oz") is None
    assert parse_with_rules("1,00 ct") is None
