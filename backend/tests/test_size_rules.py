from decimal import Decimal

import pytest

from shrinkflation.sizes import MeasureKind, parse_with_rules


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
        ("6 - 16.9 fl oz", 6, Decimal("2998.7559")),
        ("24 ct / 16.9 fl oz", 24, Decimal("11995.0236")),
        ("8 pk / 12 fl oz", 8, Decimal("2839.0588")),
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
