import { describe, expect, it } from "vitest";
import * as fx from "../api/fixtures";
import type { ChangeOut } from "../api/types";
import { latestByProduct, unitChangePct } from "./changes";

const base = fx.changes[0]!;

function changeFor(id: number, productId: string, detectedAt: string, over: Partial<ChangeOut> = {}): ChangeOut {
  return { ...base, id, product: { ...base.product, id: productId }, detected_at: detectedAt, ...over };
}

describe("unitChangePct", () => {
  it("reads the unit price change as a number", () => {
    expect(unitChangePct({ unit_price_change_pct: "3.45", price_change_pct: "10.00" })).toBe(3.45);
    expect(unitChangePct({ unit_price_change_pct: "-27.30", price_change_pct: null })).toBe(-27.3);
    expect(unitChangePct(base)).toBe(3.45);
  });

  it("falls back to the shelf price change when there is no unit price change", () => {
    expect(unitChangePct({ unit_price_change_pct: null, price_change_pct: "-12.50" })).toBe(-12.5);
    expect(unitChangePct({ unit_price_change_pct: undefined, price_change_pct: "4" })).toBe(4);
    expect(unitChangePct({ unit_price_change_pct: "", price_change_pct: "5.5" })).toBe(5.5);
    expect(unitChangePct({ unit_price_change_pct: null, price_change_pct: null })).toBeNull();
    expect(unitChangePct({ unit_price_change_pct: "abc", price_change_pct: "" })).toBeNull();
  });
});

describe("latestByProduct", () => {
  it("keeps the newest change of each product whatever the input order", () => {
    const older = changeFor(1, "p1", "2026-09-10T11:00:00Z");
    const newer = changeFor(2, "p1", "2026-09-20T11:00:00Z");
    const other = changeFor(3, "p2", "2026-09-15T11:00:00Z");
    expect([...latestByProduct([older, newer, other]).entries()]).toEqual([
      ["p1", newer],
      ["p2", other],
    ]);
    expect(latestByProduct([newer, other, older]).get("p1")).toBe(newer);
    expect(latestByProduct([other, older, newer]).size).toBe(2);
  });

  it("breaks a tie on detected_at by the higher id", () => {
    const low = changeFor(5, "p1", "2026-09-20T11:00:00Z");
    const high = changeFor(9, "p1", "2026-09-20T11:00:00Z");
    expect(latestByProduct([low, high]).get("p1")).toBe(high);
    expect(latestByProduct([high, low]).get("p1")).toBe(high);
  });

  it("is a no-op on a list with one change per product", () => {
    const map = latestByProduct(fx.changes);
    expect(map.size).toBe(fx.changes.length);
    for (const change of fx.changes) expect(map.get(change.product.id)).toBe(change);
    expect(latestByProduct([]).size).toBe(0);
  });
});
