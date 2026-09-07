"""DeepSeek list prices, used to attribute a dollar cost to every call.

Prices are USD per 1M tokens at off-peak rates; peak hours are billed at twice these rates.
Source: https://api-docs.deepseek.com/quick_start/pricing/ (effective 2026-08-16).
"""

from datetime import UTC, datetime
from decimal import Decimal

_OFF_PEAK: dict[str, tuple[Decimal, Decimal, Decimal]] = {
    # model: (input cache miss, input cache hit, output)
    "deepseek-v4-flash": (Decimal("0.22"), Decimal("0.007"), Decimal("0.66")),
    "deepseek-v4-pro": (Decimal("0.66"), Decimal("0.022"), Decimal("1.98")),
    "deepseek-v4-flash-vision-exp": (Decimal("0.22"), Decimal("0.007"), Decimal("0.66")),
}

_PEAK_WINDOWS_UTC = ((1, 4), (6, 10))
_MILLION = Decimal(1_000_000)


def is_peak(at: datetime | None = None) -> bool:
    """Peak pricing applies Monday to Friday, 01:00-04:00 and 06:00-10:00 UTC."""
    now = (at or datetime.now(UTC)).astimezone(UTC)
    if now.weekday() >= 5:
        return False
    return any(start <= now.hour < end for start, end in _PEAK_WINDOWS_UTC)


def estimate_cost(
    model: str,
    *,
    prompt_tokens: int,
    completion_tokens: int,
    cached_tokens: int = 0,
    at: datetime | None = None,
) -> Decimal:
    """Cost in USD for one call. Unknown models are priced at the pro rate to stay conservative."""
    miss_rate, hit_rate, out_rate = _OFF_PEAK.get(model, _OFF_PEAK["deepseek-v4-pro"])
    multiplier = Decimal(2) if is_peak(at) else Decimal(1)
    cached = min(max(cached_tokens, 0), prompt_tokens)
    missed = prompt_tokens - cached
    cost = (
        Decimal(missed) * miss_rate
        + Decimal(cached) * hit_rate
        + Decimal(completion_tokens) * out_rate
    ) / _MILLION
    return (cost * multiplier).quantize(Decimal("0.000001"))
