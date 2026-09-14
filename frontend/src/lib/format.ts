// Display formatting for values the API returns as decimal strings and ISO timestamps.
// Rounding works on the decimal digits so "0.3975" rounds half up like the backend does,
// instead of through a binary float.

export const MINUS = "−";
export const ARROW = "→";

// The tracked store's timezone (Newport, KY is Eastern). Observation days are shown in it so
// they match the store's business day and do not shift with the viewer's timezone. A refresh
// run at 00:30 UTC is still "yesterday evening" at the store, not the next day.
const STORE_TIMEZONE = "America/New_York";

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

// "$0.397" with four decimals when the price is under one cent per unit. The unit is shown
// once by the caller.
export function formatUnitAmount(value: Numeric): string | null {
  const n = toNumber(value);
  if (n === null) return null;
  const digits = Math.abs(n) < 0.01 ? 4 : 3;
  return `$${roundDecimal(value as string | number, digits)}`;
}

// "$0.397/oz", or null when either part is missing.
export function formatUnitPrice(value: Numeric, unit: string | null | undefined): string | null {
  const amount = formatUnitAmount(value);
  if (amount === null || !unit) return null;
  return `${amount}/${unit}`;
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
  timeZone: STORE_TIMEZONE,
});

interface DateParts {
  month: string;
  day: string;
  year: string;
}

function dateParts(iso: string | null | undefined): DateParts | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = dateFormat.formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return { month: pick("month"), day: pick("day"), year: pick("year") };
}

// "Sep 7, 2026" in the store's timezone.
export function formatDate(iso: string | null | undefined): string | null {
  const parts = dateParts(iso);
  return parts ? `${parts.month} ${parts.day}, ${parts.year}` : null;
}

// "Sep 7", for places where the year is shown elsewhere or is the current one.
export function formatDateShort(iso: string | null | undefined): string | null {
  const parts = dateParts(iso);
  return parts ? `${parts.month} ${parts.day}` : null;
}

function currentYear(): string {
  return dateParts(new Date().toISOString())?.year ?? "";
}

// The span between two observation days, as short as it can be read without ambiguity:
// "Aug 20 → 24", "Aug 31 → Sep 1", and "Dec 30 → Jan 2, 2027" when a year is not the
// current one. A single date is returned when only one side is known.
export function formatDateRange(
  fromIso: string | null | undefined,
  toIso: string | null | undefined,
): string | null {
  const from = dateParts(fromIso);
  const to = dateParts(toIso);
  const year = currentYear();
  const withYear = (parts: DateParts) =>
    parts.year === year ? `${parts.month} ${parts.day}` : `${parts.month} ${parts.day}, ${parts.year}`;
  if (from && !to) return withYear(from);
  if (to && !from) return withYear(to);
  if (!from || !to) return null;
  if (from.year === to.year) {
    const suffix = from.year === year ? "" : `, ${from.year}`;
    if (from.month === to.month) {
      const days = from.day === to.day ? from.day : `${from.day} ${ARROW} ${to.day}`;
      return `${from.month} ${days}${suffix}`;
    }
    return `${from.month} ${from.day} ${ARROW} ${to.month} ${to.day}${suffix}`;
  }
  return `${withYear(from)} ${ARROW} ${withYear(to)}`;
}

// "84 ms" below a second, "3.1 s" above.
export function formatDuration(ms: Numeric): string {
  const n = toNumber(ms);
  if (n === null) return "";
  if (n < 1000) return `${formatInt(n)} ms`;
  return `${roundDecimal(n / 1000, 1)} s`;
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

const dayKeyFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: STORE_TIMEZONE,
});

// The calendar day of an instant at the store, counted in days so two can be subtracted.
function storeDay(iso: string): number | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = dayKeyFormat.formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "");
  return Date.UTC(pick("year"), pick("month") - 1, pick("day")) / 86_400_000;
}

// Calendar days at the store from the first to the last observation, inclusive.
export function daysObserved(firstIso: string, lastIso: string): number {
  const first = storeDay(firstIso);
  const last = storeDay(lastIso);
  if (first === null || last === null || last < first) return 1;
  return last - first + 1;
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
  return better ? "better" : "worse";
}
