import { describe, expect, it } from "vitest";
import {
  MINUS,
  daysObserved,
  deltaClass,
  formatDate,
  formatInt,
  formatMoney,
  formatPercent,
  formatQuantity,
  formatUnitPrice,
  percentChange,
  pluralize,
  roundDecimal,
  trimDecimal,
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
    expect(formatUnitPrice("1.5", "each")).toBe("$1.500/each");
    expect(formatUnitPrice(null, "oz")).toBeNull();
    expect(formatUnitPrice("0.3", null)).toBeNull();
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
  });
});

describe("formatDate", () => {
  it("formats in the store's Eastern timezone so the day matches the store's business day", () => {
    expect(formatDate("2026-09-07T22:54:30.883952Z")).toBe("Sep 7, 2026");
    // Just past UTC midnight is still the previous evening in Kentucky.
    expect(formatDate("2026-08-14T00:10:00Z")).toBe("Aug 13, 2026");
    expect(formatDate("2026-01-01T23:59:59Z")).toBe("Jan 1, 2026");
    expect(formatDate(null)).toBeNull();
    expect(formatDate("not a date")).toBeNull();
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
  });
  it("counts observed calendar days inclusively", () => {
    expect(daysObserved("2026-08-02T22:54:00Z", "2026-08-02T22:54:00Z")).toBe(1);
    expect(daysObserved("2026-08-02T22:54:00Z", "2026-08-13T22:56:00Z")).toBe(12);
    expect(daysObserved("2026-08-13T22:56:00Z", "2026-08-02T22:54:00Z")).toBe(1);
  });
  it("computes percent change", () => {
    expect(percentChange("0.3575", "0.3972")).toBeCloseTo(11.1, 1);
    expect(percentChange("0", "1")).toBeNull();
    expect(percentChange(null, "1")).toBeNull();
  });
});

describe("deltaClass", () => {
  it("colors by what the change means for the shopper", () => {
    expect(deltaClass("-10.00", true)).toBe("delta-down");
    expect(deltaClass("5.00", true)).toBe("delta-up");
    expect(deltaClass("11.11", false)).toBe("delta-down");
    expect(deltaClass("-14.30", false)).toBe("delta-up");
    expect(deltaClass("0.00", false)).toBe("");
    expect(deltaClass(null, false)).toBe("");
  });
});

it("counts calendar days even when times of day differ", () => {
  expect(daysObserved("2026-07-06T22:54:30Z", "2026-07-27T12:00:00Z")).toBe(22);
});
