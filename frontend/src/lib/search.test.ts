import { describe, expect, it } from "vitest";
import * as fx from "../api/fixtures";
import { highlightRuns, searchProducts } from "./search";

describe("searchProducts", () => {
  it("matches every word against name, brand, and category, changed products first", () => {
    const wipes = searchProducts(fx.field.products, "wipes");
    expect(wipes.total).toBeGreaterThan(1);
    expect(wipes.items[0]!.id).toBe(fx.ids.huggies);
    expect(wipes.items.length).toBeLessThanOrEqual(10);
    const two = searchProducts(fx.field.products, "huggies unscented");
    expect(two.items.map((p) => p.id)).toContain(fx.ids.huggies);
    expect(searchProducts(fx.field.products, "candy").total).toBe(38);
    expect(searchProducts(fx.field.products, "   ")).toEqual({ total: 0, items: [] });
    expect(searchProducts(fx.field.products, "zzzz").total).toBe(0);
  });

  it("highlights matched pieces", () => {
    expect(highlightRuns("Huggies Baby Wipes", "wipes hug")).toEqual([
      { text: "Hug", hit: true },
      { text: "gies Baby ", hit: false },
      { text: "Wipes", hit: true },
    ]);
    expect(highlightRuns("Plain", "")).toEqual([{ text: "Plain", hit: false }]);
  });
});
