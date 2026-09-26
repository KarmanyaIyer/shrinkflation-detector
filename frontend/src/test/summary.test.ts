import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fx from "../api/fixtures";
import type { ChangeOut, ProductDetail } from "../api/types";
import { sizeNoteOf, summaryOf } from "../components/ProductDrawer";

// The drawer's first sentences, written from the product's records.
function detail(id: string): ProductDetail {
  const found = fx.detailFor(id);
  if (!found) throw new Error(`no fixture for ${id}`);
  return found;
}

function withChanges(base: ProductDetail, changes: ChangeOut[]): ProductDetail {
  return { ...base, changes };
}

beforeEach(() => {
  // Dates in the current year print without the year; pin "now" to the fixtures' year.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("summaryOf", () => {
  it("says so when a product never changed", () => {
    const unchanged = fx.field.products.find((product) => !product.change)!;
    const d = detail(unchanged.id);
    const checks = d.snapshots.reduce((sum, s) => sum + s.observations, 0);
    expect(summaryOf(d)).toBe(`Tracked since Sep 7, 2026, with no size or price change across ${checks} checks.`);
  });

  it("writes a size change with the unchanged price and what it did to the price per unit", () => {
    expect(summaryOf(detail(fx.ids.huggies))).toBe(
      "One change since Sep 7, 2026. Between Sep 15 and 16, the listed size went from “192 ct” to “56 ct” and the shelf price stayed at $6.99, so the price per item rose 242.9%.",
    );
  });

  it("writes a price change in words, without a sign", () => {
    expect(summaryOf(detail(fx.ids.reeses))).toBe(
      "One change since Sep 7, 2026. Between Sep 15 and 16, the shelf price went from $5.49 to $3.99, so the price per ounce fell 27.3%.",
    );
    expect(summaryOf(detail(fx.ids.lateJuly))).toBe(
      "One change since Sep 7, 2026. Between Sep 22 and 23, the shelf price went from $5.79 to $5.99, so the price per ounce rose 3.5%.",
    );
  });

  it("leads with the newest of several changes, breaking a tie on time by id", () => {
    const base = detail(fx.ids.reeses);
    const drop = base.changes[0]!;
    const older: ChangeOut = {
      ...drop,
      id: drop.id - 30,
      kind: "price_increase",
      unit_price_change_pct: "4.00",
      price_change_pct: "4.00",
      detected_at: "2026-09-10T11:00:00Z",
      before_seen_at: "2026-09-09T11:00:00Z",
      after_seen_at: "2026-09-10T11:00:00Z",
    };
    // Given oldest first, the newest still leads.
    expect(summaryOf(withChanges(base, [older, drop]))).toBe(
      "Two changes since Sep 7, 2026. Most recently, between Sep 15 and 16, the shelf price went from $5.49 to $3.99, so the price per ounce fell 27.3%.",
    );
    // Same detection time: the higher id is the later change.
    const twin: ChangeOut = { ...older, id: drop.id + 1, detected_at: drop.detected_at };
    expect(summaryOf(withChanges(base, [drop, twin]))).toMatch(/so the price per ounce rose 4\.0%\.$/);
  });

  it("says on which day when both sides were seen the same day, and across a month end", () => {
    const base = detail(fx.ids.reeses);
    const drop = base.changes[0]!;
    const sameDay = { ...drop, before_seen_at: "2026-09-16T05:00:00Z", after_seen_at: "2026-09-16T11:00:00Z" };
    expect(summaryOf(withChanges(base, [sameDay]))).toMatch(/^One change since Sep 7, 2026\. On Sep 16, /);
    const monthEnd = { ...drop, before_seen_at: "2026-09-30T11:00:00Z", after_seen_at: "2026-10-01T11:00:00Z" };
    expect(summaryOf(withChanges(base, [monthEnd]))).toMatch(/\. Between Sep 30 and Oct 1, the shelf price/);
  });

  it("leaves out the price per unit clause when there is none", () => {
    const base = detail(fx.ids.reeses);
    const drop = base.changes[0]!;
    const noUnit = { ...drop, unit_price_change_pct: null, price_change_pct: null };
    expect(summaryOf(withChanges(base, [noUnit]))).toBe(
      "One change since Sep 7, 2026. Between Sep 15 and 16, the shelf price went from $5.49 to $3.99.",
    );
  });
});

describe("sizeNoteOf", () => {
  const reads = "The detector reads the listed size, so a corrected listing and";

  it("gives the text clue and the reading caveat for a listed size that went down", () => {
    expect(sizeNoteOf(detail(fx.ids.philadelphia))).toBe(`The earlier text said “each”; the new text does not. ${reads} a smaller package look the same.`);
    // The summary already gives the numbers, so a size that fell by more than half adds no clue.
    expect(sizeNoteOf(detail(fx.ids.huggies))).toBe(`${reads} a smaller package look the same.`);
    expect(sizeNoteOf(detail(fx.ids.dove))).toBe(`The earlier text had a pack count; the new text does not. ${reads} a smaller package look the same.`);
  });

  it("says a larger package for a listed size that went up", () => {
    expect(sizeNoteOf(detail(fx.ids.khloud))).toBe(`The product name still says “4.0 oz”. ${reads} a larger package look the same.`);
  });

  it("uses the newest size change and stays quiet for price moves", () => {
    expect(sizeNoteOf(detail(fx.ids.reeses))).toBeNull();
    const base = detail(fx.ids.huggies);
    const shrink = base.changes[0]!;
    const grow: ChangeOut = { ...shrink, id: shrink.id + 1, kind: "grow", detected_at: "2026-09-20T11:00:00Z" };
    expect(sizeNoteOf(withChanges(base, [shrink, grow]))).toMatch(/a larger package look the same\.$/);
    const price: ChangeOut = { ...shrink, id: shrink.id + 2, kind: "price_increase", detected_at: "2026-09-21T11:00:00Z" };
    expect(sizeNoteOf(withChanges(base, [shrink, price]))).toMatch(/a smaller package look the same\.$/);
  });
});
