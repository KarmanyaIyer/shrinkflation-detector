import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import {
  MINUS,
  betweenDays,
  daysObserved,
  formatDate,
  formatDateRange,
  formatDateShort,
  formatDuration,
  formatInt,
  formatMoney,
  formatPercent,
  formatQuantity,
  formatSpan,
  formatTime,
  formatUnitAmount,
  formatUnitPrice,
  countNoun,
  daysBetween,
  numberWord,
  percentChange,
  pluralize,
  quoted,
  roundDecimal,
  trimDecimal,
  unitWord,
} from "./format";

describe("roundDecimal", () => {
  it("rounds half away from zero on the decimal digits", () => {
    expect(roundDecimal("0.3975", 3)).toBe("0.398");
    expect(roundDecimal("0.3974", 3)).toBe("0.397");
    expect(roundDecimal("-10.05", 1)).toBe("-10.1");
    expect(roundDecimal("2.999", 2)).toBe("3.00");
    expect(roundDecimal("9.99", 1)).toBe("10.0");
    expect(roundDecimal("4", 2)).toBe("4.00");
    expect(roundDecimal("-0.04", 1)).toBe("0.0");
    expect(roundDecimal(1234.5, 0)).toBe("1235");
    expect(roundDecimal("0004.5", 1)).toBe("4.5");
  });
});

describe("formatMoney", () => {
  it("formats dollars with two decimals and grouping", () => {
    expect(formatMoney("4.29")).toBe("$4.29");
    expect(formatMoney("4.5")).toBe("$4.50");
    expect(formatMoney("1234.5")).toBe("$1,234.50");
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney("-2.5")).toBe(`${MINUS}$2.50`);
  });
  it("returns null for missing values", () => {
    expect(formatMoney(null)).toBeNull();
    expect(formatMoney(undefined)).toBeNull();
    expect(formatMoney("")).toBeNull();
    expect(formatMoney("abc")).toBeNull();
  });
});

describe("formatUnitPrice", () => {
  it("uses three decimals, or four under one cent", () => {
    expect(formatUnitPrice("0.3972", "oz")).toBe("$0.397/oz");
    expect(formatUnitPrice("0.3575", "oz")).toBe("$0.358/oz");
    expect(formatUnitPrice("0.0085", "sq ft")).toBe("$0.0085/sq ft");
    expect(formatUnitPrice("1.5", "each")).toBe("$1.500/item");
    expect(formatUnitPrice(null, "oz")).toBeNull();
    expect(formatUnitPrice("0.3", null)).toBeNull();
    expect(formatUnitAmount("0.3575")).toBe("$0.358");
  });
});

describe("formatPercent", () => {
  it("is signed with one decimal and a real minus sign", () => {
    expect(formatPercent("-10.00")).toBe(`${MINUS}10.0%`);
    expect(formatPercent("11.11")).toBe("+11.1%");
    expect(formatPercent("0.00")).toBe("0.0%");
    expect(formatPercent("-0.04")).toBe("0.0%");
    expect(formatPercent(3.25)).toBe("+3.3%");
    expect(formatPercent(null)).toBeNull();
    expect(formatPercent("30", 0)).toBe("+30%");
    expect(formatPercent("0", 0)).toBe("0%");
  });
});

describe("dates", () => {
  it("formats in the store's Eastern timezone so the day matches the store's business day", () => {
    expect(formatDate("2026-09-07T22:54:30.883952Z")).toBe("Sep 7, 2026");
    // Just past UTC midnight is still the previous evening at the store.
    expect(formatDate("2026-08-14T00:10:00Z")).toBe("Aug 13, 2026");
    expect(formatDate("2026-01-01T23:59:59Z")).toBe("Jan 1, 2026");
    expect(formatDate(null)).toBeNull();
    expect(formatDate("not a date")).toBeNull();
    expect(formatDateShort("2026-09-07T22:54:30Z")).toBe("Sep 7");
  });

  it("writes a span as short as it can be read", () => {
    // The year is only shown when it differs from the current one, so pin "now".
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
    onTestFinished(() => {
      vi.useRealTimers();
    });
    expect(formatDateRange("2026-08-20T06:00:00Z", "2026-08-24T06:00:00Z")).toBe("Aug 20 to 24");
    expect(formatDateRange("2026-08-31T06:00:00Z", "2026-09-01T06:00:00Z")).toBe("Aug 31 to Sep 1");
    expect(formatDateRange("2026-08-20T06:00:00Z", "2026-08-20T06:00:00Z")).toBe("Aug 20");
    expect(formatDateRange("2025-12-30T06:00:00Z", "2026-01-02T06:00:00Z")).toBe("Dec 30, 2025 to Jan 2");
    expect(formatDateRange("2025-08-20T06:00:00Z", "2025-08-24T06:00:00Z")).toBe("Aug 20 to 24, 2025");
    expect(formatDateRange("2026-08-20T06:00:00Z", null)).toBe("Aug 20");
    expect(formatDateRange(null, null)).toBeNull();
  });

  it("formats durations and spans", () => {
    expect(formatDuration(84)).toBe("84 ms");
    expect(formatDuration(3120)).toBe("3.1 s");
    expect(formatDuration(null)).toBe("");
    expect(formatSpan(401_000)).toBe("6 minutes 41 seconds");
    expect(formatSpan(60_000)).toBe("1 minute");
    expect(formatSpan(4_000)).toBe("4 seconds");
  });

  it("formats the time of day at the store", () => {
    expect(formatTime("2026-09-23T11:07:00.964933Z")).toBe("7:07 a.m.");
    expect(formatTime("2026-12-23T11:07:00Z")).toBe("6:07 a.m.");
    expect(formatTime("2026-09-07T22:54:30Z")).toBe("6:54 p.m.");
    expect(formatTime(null)).toBeNull();
  });
});

describe("formatQuantity", () => {
  it("strips trailing zeros and keeps the unit", () => {
    expect(formatQuantity("10.8000", "oz")).toBe("10.8 oz");
    expect(formatQuantity("12.0000", "oz")).toBe("12 oz");
    expect(formatQuantity("0.5000", "gal")).toBe("0.5 gal");
    expect(formatQuantity("144.0000", "fl oz")).toBe("144 fl oz");
    expect(formatQuantity(null, "oz")).toBeNull();
    expect(formatQuantity("12", null)).toBeNull();
  });
  it("trimDecimal leaves integers alone", () => {
    expect(trimDecimal("100")).toBe("100");
    expect(trimDecimal("100.10")).toBe("100.1");
  });
});

describe("counts and spans", () => {
  it("groups integers and pluralizes", () => {
    expect(formatInt(1242)).toBe("1,242");
    expect(pluralize(1, "change")).toBe("1 change");
    expect(pluralize(14, "change")).toBe("14 changes");
    expect(pluralize(0, "product")).toBe("0 products");
    expect(pluralize(2, "match", "matches")).toBe("2 matches");
  });
  it("counts observed calendar days at the store inclusively", () => {
    expect(daysObserved("2026-08-02T22:54:00Z", "2026-08-02T22:54:00Z")).toBe(1);
    expect(daysObserved("2026-08-02T22:54:00Z", "2026-08-13T22:56:00Z")).toBe(12);
    expect(daysObserved("2026-08-13T22:56:00Z", "2026-08-02T22:54:00Z")).toBe(1);
    expect(daysObserved("2026-07-06T22:54:30Z", "2026-07-27T12:00:00Z")).toBe(22);
    // 00:30 UTC is still the previous evening at the store, so this spans Sep 1 to Sep 4.
    expect(daysObserved("2026-09-02T00:30:00Z", "2026-09-04T06:00:00Z")).toBe(4);
    expect(daysObserved("not a date", "2026-09-04T06:00:00Z")).toBe(1);
  });
  it("counts elapsed store days", () => {
    expect(daysBetween("2026-09-07T22:54:30Z", "2026-09-23T11:07:00Z")).toBe(16);
    expect(daysBetween("2026-09-07T22:54:30Z", "2026-09-07T23:54:30Z")).toBe(0);
    expect(daysBetween("2026-09-08T00:30:00Z", "2026-09-08T12:00:00Z")).toBe(1);
  });
  it("writes small numbers as words", () => {
    expect(numberWord(3)).toBe("three");
    expect(numberWord(10)).toBe("10");
    expect(numberWord(1242)).toBe("1,242");
    expect(countNoun(1, "price")).toBe("one price");
    expect(countNoun(38, "price")).toBe("38 prices");
    expect(unitWord("each")).toBe("item");
    expect(unitWord("fl oz")).toBe("fl oz");
    expect(quoted("12 oz")).toBe("\u201C12 oz\u201D");
  });
  it("computes percent change", () => {
    expect(percentChange("0.3575", "0.3972")).toBeCloseTo(11.1, 1);
    expect(percentChange("0", "1")).toBeNull();
    expect(percentChange(null, "1")).toBeNull();
  });
});

describe("betweenDays", () => {
  // The year is only shown when it differs from the current one, so pin "now".
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("names the store days a change fell between", () => {
    expect(betweenDays("2026-09-15T22:00:00Z", "2026-09-16T22:00:00Z")).toBe("between Sep 15 and 16");
    expect(betweenDays("2026-09-30T22:00:00Z", "2026-10-01T22:00:00Z")).toBe("between Sep 30 and Oct 1");
    // 00:30 UTC is still the evening before at the store.
    expect(betweenDays("2026-09-17T00:30:00Z", "2026-09-17T12:00:00Z")).toBe("between Sep 16 and 17");
  });

  it("names one day when both sides fall on the same store day or only one is known", () => {
    expect(betweenDays("2026-09-16T11:00:00Z", "2026-09-16T22:00:00Z")).toBe("on Sep 16");
    expect(betweenDays(null, "2026-09-16T22:00:00Z")).toBe("on Sep 16");
    expect(betweenDays("2026-09-16T22:00:00Z", undefined)).toBe("on Sep 16");
    expect(betweenDays(null, null)).toBeNull();
    expect(betweenDays("not a date", null)).toBeNull();
  });

  it("adds the year when it is not the current one", () => {
    expect(betweenDays("2025-12-30T22:00:00Z", "2025-12-31T22:00:00Z")).toBe("between Dec 30 and 31, 2025");
    expect(betweenDays("2025-11-30T22:00:00Z", "2025-12-01T22:00:00Z")).toBe("between Nov 30 and Dec 1, 2025");
    expect(betweenDays("2025-12-31T22:00:00Z", "2026-01-01T22:00:00Z")).toBe("between Dec 31, 2025 and Jan 1");
    expect(betweenDays("2025-12-31T22:00:00Z", null)).toBe("on Dec 31, 2025");
  });
});
