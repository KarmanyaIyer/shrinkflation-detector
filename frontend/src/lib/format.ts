// Display formatting for values the API returns as decimal strings and ISO timestamps.
// Rounding works on the decimal digits so "0.3975" rounds half up like the backend does,
// instead of through a binary float.

export const MINUS = "−";
export const ARROW = "→";

type Numeric = string | number | null | undefined;

export function toNumber(value: Numeric): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function incrementDigits(digits: string): string {
  const out = digits.split("");
  for (let i = out.length - 1; i >= 0; i -= 1) {
    if (out[i] === "9") {
      out[i] = "0";
    } else {
      out[i] = String(Number(out[i]) + 1);
      return out.join("");
    }
  }
  return `1${out.join("")}`;
}

// Round a decimal string half away from zero to a fixed number of fraction digits.
export function roundDecimal(value: string | number, digits: number): string {
  let text = typeof value === "number" ? value.toString() : value.trim();
  if (/e/i.test(text)) text = Number(text).toFixed(20);
  let negative = false;
  if (text.startsWith("-") || text.startsWith("+")) {
    negative = text.startsWith("-");
    text = text.slice(1);
  }
  const [intRaw = "", fracRaw = ""] = text.split(".");
  const intPart = intRaw.replace(/^0+(?=\d)/, "") || "0";
  const frac = fracRaw.padEnd(digits + 1, "0");
  let kept = intPart + frac.slice(0, digits);
  if (Number(frac.charAt(digits)) >= 5) kept = incrementDigits(kept);
  const intLength = kept.length - digits;
  const outInt = kept.slice(0, intLength) || "0";
  const outFrac = kept.slice(intLength);
  const out = digits > 0 ? `${outInt}.${outFrac}` : outInt;
  if (/^[0.]+$/.test(out)) negative = false;
  return negative ? `-${out}` : out;
}

function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatInt(value: Numeric): string {
  const n = toNumber(value);
  if (n === null) return "";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

// "$4.29". Negative amounts use the real minus sign.
export function formatMoney(value: Numeric): string | null {
  if (toNumber(value) === null) return null;
  const rounded = roundDecimal(value as string | number, 2);
  const negative = rounded.startsWith("-");
  const [intPart = "0", frac = "00"] = rounded.replace("-", "").split(".");
  return `${negative ? MINUS : ""}$${group(intPart)}.${frac}`;
}

// "$0.397/oz", with four decimals when the price is under one cent per unit.
export function formatUnitPrice(value: Numeric, unit: string | null | undefined): string | null {
  const n = toNumber(value);
  if (n === null || !unit) return null;
  const digits = Math.abs(n) < 0.01 ? 4 : 3;
  return `$${roundDecimal(value as string | number, digits)}/${unit}`;
}

// Signed with one decimal: "-10.0%" (real minus sign), "+11.1%", "0.0%".
export function formatPercent(value: Numeric): string | null {
  if (toNumber(value) === null) return null;
  const rounded = roundDecimal(value as string | number, 1);
  if (rounded === "0.0" || rounded === "-0.0") return "0.0%";
  if (rounded.startsWith("-")) return `${MINUS}${rounded.slice(1)}%`;
  return `+${rounded}%`;
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/New_York",
});

// "Sep 7, 2026" in the tracked store's timezone (Newport, KY is Eastern), so observation days
// match the store's business day and do not shift with the viewer's timezone. A refresh run at
// 00:30 UTC is still "yesterday evening" at the store, not the next day.
export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return dateFormat.format(date);
}

// Strip trailing zeros from a decimal string: "10.8000" to "10.8", "12.0000" to "12".
export function trimDecimal(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/\.?0+$/, "");
}

// "10.8 oz" from the parsed display quantity and unit, or null when either is missing.
export function formatQuantity(
  quantity: Numeric,
  unit: string | null | undefined,
): string | null {
  const n = toNumber(quantity);
  if (n === null || !unit) return null;
  const text = typeof quantity === "number" ? String(quantity) : trimDecimal(quantity!.trim());
  return `${text} ${unit}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatInt(count)} ${count === 1 ? singular : plural}`;
}

// Calendar days from the first to the last observation, inclusive.
export function daysObserved(firstIso: string, lastIso: string): number {
  const first = new Date(firstIso);
  const last = new Date(lastIso);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) return 1;
  const firstDay = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate());
  const lastDay = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate());
  if (lastDay < firstDay) return 1;
  return (lastDay - firstDay) / 86_400_000 + 1;
}

// Relative change in percent between two decimal values, or null when not computable.
export function percentChange(before: Numeric, after: Numeric): number | null {
  const a = toNumber(before);
  const b = toNumber(after);
  if (a === null || b === null || a === 0) return null;
  return ((b - a) / a) * 100;
}

// CSS class for a signed change, colored by what it means for the shopper.
// Size: more is better. Price and unit price: less is better.
export function deltaClass(value: Numeric, moreIsBetter: boolean): string {
  const n = toNumber(value);
  if (n === null || Math.abs(n) < 0.05) return "";
  const better = n > 0 ? moreIsBetter : !moreIsBetter;
  return better ? "delta-up" : "delta-down";
}
