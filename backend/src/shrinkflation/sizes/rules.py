"""Deterministic size parsing. Handles the common label formats without a model call.

Anything this module cannot read with confidence is left to the LLM parser. That includes
multipack labels such as "6 ct / 18 oz", where the amount may be per item or for the whole
package depending on the product.
"""

import re
from decimal import Decimal, InvalidOperation
from fractions import Fraction

from shrinkflation.sizes.schema import BASE_UNIT_FOR_KIND, ParsedSize, clean_decimal
from shrinkflation.sizes.units import UNITS, canonical_unit, display_count_word

_NUM = r"(?:\d+\s+\d+/\d+|\d+/\d+|\d+(?:[.,]\d+)?|\.\d+)"
_UNIT = r"[a-zA-Z][a-zA-Z. ()-]*?"
_PACK_WORD = r"(?:ct|count|cnt|pk|pack|packs|cans|bottles|pouches|bags|cups|boxes|bars|pods)"

_SIMPLE = re.compile(rf"^\s*(?P<q>{_NUM})\s*(?P<u>{_UNIT})\s*\.?\s*$")
_FRACTION = re.compile(rf"^\s*(?P<q>\d+/\d+|\d+\s+\d+/\d+)\s*(?P<u>{_UNIT})\s*\.?\s*$")
# "12 x 12 fl oz": the multiplication sign makes the per-unit reading explicit.
_MULTIPACK = re.compile(rf"^\s*(?P<n>\d+)\s*(?:x|X|×)\s*(?P<q>{_NUM})\s*(?P<u>{_UNIT})\s*\.?\s*$")
# "6 ct / 18 oz", "8 pk - 12 fl oz", "5.3 oz., 4 pack": a count next to an amount, scope unstated.
_PACK_MARKER = re.compile(rf"(?:^|[\s\d]){_PACK_WORD}(?:$|[\s/.,-])", re.IGNORECASE)
_NUMBER = re.compile(_NUM)
_SEPARATOR = re.compile(r"/|\d\s*[–-]\s*\d")
_UNIT_ONLY = re.compile(rf"^\s*(?P<u>{_UNIT})\s*$")


def _to_decimal(text: str) -> Decimal | None:
    text = text.strip().replace(",", ".")
    try:
        if "/" in text:
            whole, _, frac = text.rpartition(" ")
            value = Fraction(frac) + (Fraction(int(whole)) if whole else 0)
            return Decimal(value.numerator) / Decimal(value.denominator)
        return Decimal(text)
    except (InvalidOperation, ValueError, ZeroDivisionError):
        return None


def _is_proper_fraction(text: str) -> bool:
    """True for '1/2' or '1 1/2', false for '3/2' which is not how labels write sizes."""
    _, _, frac = text.strip().rpartition(" ")
    numerator, _, denominator = frac.partition("/")
    return numerator.isdigit() and denominator.isdigit() and int(denominator) > int(numerator) > 0


def _build(
    quantity: Decimal,
    unit_label: str,
    *,
    pack_count: int | None = None,
    confidence: float,
) -> ParsedSize | None:
    canon = canonical_unit(unit_label)
    if canon is None or quantity <= 0:
        return None
    kind, factor = UNITS[canon]
    per_unit = quantity
    total = quantity * (pack_count or 1)
    return ParsedSize(
        measure_kind=kind,
        quantity=(total * factor).quantize(Decimal("0.0001")),
        base_unit=BASE_UNIT_FOR_KIND[kind],
        display_quantity=clean_decimal(total),
        display_unit=display_count_word(unit_label) if canon in {"count", "dozen"} else canon,
        pack_count=pack_count,
        unit_quantity=clean_decimal(per_unit) if pack_count else None,
        confidence=confidence,
        method="rule",
    )


def is_ambiguous_multipack(size_text: str | None) -> bool:
    """True for labels that pair a count with an amount without saying which one it applies to.

    At least two numbers plus a pack word or a slash, excluding the explicit "12 x 12 fl oz" form.
    """
    if not size_text or _MULTIPACK.match(size_text):
        return False
    numbers = _NUMBER.findall(size_text)
    return len(numbers) >= 2 and (
        _PACK_MARKER.search(size_text) is not None or _SEPARATOR.search(size_text) is not None
    )


def parse_with_rules(size_text: str | None) -> ParsedSize | None:
    """Return a ParsedSize for label formats the rules understand, otherwise None."""
    if not size_text:
        return None
    text = size_text.strip()
    if not text:
        return None

    match = _FRACTION.match(text)
    if match and _is_proper_fraction(match.group("q")):
        quantity = _to_decimal(match.group("q"))
        if quantity is not None:
            parsed = _build(quantity, match.group("u"), confidence=1.0)
            if parsed:
                return parsed

    match = _MULTIPACK.match(text)
    if match:
        quantity = _to_decimal(match.group("q"))
        if quantity is not None:
            parsed = _build(
                quantity, match.group("u"), pack_count=int(match.group("n")), confidence=0.95
            )
            if parsed:
                return parsed

    match = _SIMPLE.match(text)
    if match:
        quantity = _to_decimal(match.group("q"))
        if quantity is not None:
            parsed = _build(quantity, match.group("u"), confidence=1.0)
            if parsed:
                return parsed

    match = _UNIT_ONLY.match(text)
    if match and canonical_unit(match.group("u")) == "count":
        return _build(Decimal(1), match.group("u"), confidence=0.9)

    return None
