import { describe, expect, it } from "vitest";
import * as fx from "../api/fixtures";
import type { FieldProduct } from "../api/types";
import { SEARCH_LIMIT, brandOnlyMatch, highlightRuns, searchProducts, searchSuggestions } from "./search";

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
    // The word joiner in a display name does not stop a match across it.
    expect(highlightRuns("Bacon, 9-\u206011 slices", "9-11")).toEqual([
      { text: "Bacon, ", hit: false },
      { text: "9-\u206011", hit: true },
      { text: " slices", hit: false },
    ]);
  });
});

describe("brandOnlyMatch", () => {
  const hershey: FieldProduct = {
    id: "0003400094686",
    name: "Hershey Assorted Flavored Snack Size Candy Party Pack",
    brand: "Reese's",
    category: "Candy",
  };

  it("is true when a typed word is found in the brand and nowhere the row shows", () => {
    expect(brandOnlyMatch(hershey, "reese")).toBe(true);
    expect(brandOnlyMatch(hershey, "reese hershey")).toBe(true);
    expect(brandOnlyMatch(hershey, "  REESE'S  ")).toBe(true);
  });

  it("is false when every word is in the name or category, or there is no brand", () => {
    expect(brandOnlyMatch(hershey, "hershey")).toBe(false);
    expect(brandOnlyMatch(hershey, "candy")).toBe(false);
    expect(brandOnlyMatch(hershey, "snack candy")).toBe(false);
    expect(brandOnlyMatch({ ...hershey, brand: null }, "reese")).toBe(false);
    expect(brandOnlyMatch({ ...hershey, brand: undefined }, "reese")).toBe(false);
    expect(brandOnlyMatch(hershey, "")).toBe(false);
    // Single letters are too short to count as a match.
    expect(brandOnlyMatch(hershey, "r")).toBe(false);
  });

  it("compares against the name as displayed, so a shouted brand in the name does not count", () => {
    const kodiak: FieldProduct = { id: "k", name: "Kodiak® Honey Oat Protein Granola", brand: "Kodiak", category: "Cereal and breakfast" };
    expect(brandOnlyMatch(kodiak, "kodiak")).toBe(false);
    const puffs = fx.field.products.find((product) => product.id === fx.ids.reeses)!;
    expect(puffs.name).toContain("REESE'S");
    expect(brandOnlyMatch(puffs, "reese's")).toBe(false);
    expect(brandOnlyMatch(puffs, "puffs")).toBe(false);
  });
});

describe("searchSuggestions", () => {
  const products = fx.field.products;

  it("offers the featured brands whose search gives a short list, in order", () => {
    expect(searchSuggestions(products, [fx.ids.reeses, fx.ids.kodiak, fx.ids.huggies, fx.ids.lateJuly])).toEqual([
      "Reese's Puffs",
      "Kodiak Cakes",
      "Huggies",
    ]);
    expect(searchSuggestions(products, [fx.ids.kodiak, fx.ids.reeses], 1)).toEqual(["Kodiak Cakes"]);
    expect(searchSuggestions(products, [])).toEqual([]);
    expect(searchSuggestions(products, ["not-a-product"])).toEqual([]);
  });

  it("keeps a brand with exactly the limit of hits and drops one that floods the list", () => {
    expect(searchProducts(products, "Dove").total).toBe(SEARCH_LIMIT);
    expect(searchSuggestions(products, [fx.ids.dove])).toEqual(["Dove"]);
    const storeBrand = products.find((product) => product.brand === "Kroger")!;
    expect(searchProducts(products, "Kroger").total).toBeGreaterThan(SEARCH_LIMIT);
    expect(searchSuggestions(products, [storeBrand.id, fx.ids.huggies])).toEqual(["Huggies"]);
  });

  it("skips products without a brand and repeats of a brand in any case", () => {
    const synthetic: FieldProduct[] = [
      { id: "a1", name: "Acme Cereal", brand: "Acme", category: "Cereal" },
      { id: "a2", name: "Acme Granola", brand: "ACME", category: "Cereal" },
      { id: "n1", name: "Plain Oats", brand: null, category: "Cereal" },
      { id: "b1", name: "Blank Brand Oats", brand: "   ", category: "Cereal" },
      { id: "z1", name: "Zest Bars", brand: "Zest", category: "Snacks" },
    ];
    expect(searchSuggestions(synthetic, ["a1", "n1", "b1", "a2", "z1"])).toEqual(["Acme", "Zest"]);
    expect(searchSuggestions(synthetic, ["a2", "a1"])).toEqual(["ACME"]);
  });
});
