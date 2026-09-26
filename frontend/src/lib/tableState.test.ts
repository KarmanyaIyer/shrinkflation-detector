import { describe, expect, it } from "vitest";
import * as fx from "../api/fixtures";
import {
  countByKind,
  DEFAULT_STATE,
  defaultDescending,
  filterChanges,
  parseSortValue,
  parseTableState,
  serializeTableState,
  SORT_OPTIONS,
  sortChanges,
  sortValue,
} from "./tableState";

describe("table state in the query string", () => {
  it("parses defaults and explicit values", () => {
    expect(parseTableState(new URLSearchParams(""))).toEqual({ kind: "all", category: null, sort: "when", descending: true });
    expect(parseTableState(new URLSearchParams("kind=shrink&category=Snacks&sort=unit"))).toEqual({
      kind: "shrink",
      category: "Snacks",
      sort: "unit",
      descending: false,
    });
    expect(parseTableState(new URLSearchParams("sort=-product&kind=bogus"))).toEqual({
      kind: "all",
      category: null,
      sort: "product",
      descending: true,
    });
  });

  it("serializes only what differs from the default and keeps other params", () => {
    const base = new URLSearchParams("utm=x");
    expect(serializeTableState({ kind: "all", category: null, sort: "when", descending: true }, base).toString()).toBe("utm=x");
    expect(
      serializeTableState({ kind: "price_increase", category: "Baby and pet", sort: "unit", descending: true }).toString(),
    ).toBe("kind=price_increase&category=Baby+and+pet&sort=-unit");
    expect(serializeTableState({ kind: "all", category: null, sort: "when", descending: false }).toString()).toBe("sort=when");
  });

  it("round-trips", () => {
    const state = { kind: "grow" as const, category: "Snacks", sort: "product" as const, descending: false };
    expect(parseTableState(serializeTableState(state))).toEqual(state);
    expect(defaultDescending("product")).toBe(false);
    expect(defaultDescending("unit")).toBe(true);
  });
});

describe("filtering and sorting", () => {
  it("filters by kind and category and counts by kind", () => {
    expect(filterChanges(fx.changes, { kind: "shrink", category: null })).toHaveLength(3);
    expect(filterChanges(fx.changes, { kind: "all", category: "Baby and pet" })).toHaveLength(12);
    expect(filterChanges(fx.changes, { kind: "price_increase", category: "Candy" })).toHaveLength(1);
    expect(countByKind(fx.changes)).toEqual({ all: 78, shrink: 3, grow: 1, price_increase: 38, price_decrease: 36 });
  });

  it("sorts by date, unit price change, and name in both directions", () => {
    const newest = sortChanges(fx.changes, { sort: "when", descending: true });
    expect(newest[0]!.after_seen_at! >= newest[newest.length - 1]!.after_seen_at!).toBe(true);
    const largest = sortChanges(fx.changes, { sort: "unit", descending: true });
    expect(largest[0]!.product.id).toBe(fx.ids.huggies);
    expect(largest[largest.length - 1]!.product.id).toBe(fx.ids.reeses);
    const names = sortChanges(fx.changes, { sort: "product", descending: false }).map((c) => c.product.description);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

describe("sort list", () => {
  it("round-trips every choice and marks the current one", () => {
    for (const option of SORT_OPTIONS) expect(sortValue(parseSortValue(option.value))).toBe(option.value);
    expect(sortValue(DEFAULT_STATE)).toBe("when:desc");
    expect(new Set(SORT_OPTIONS.map((option) => option.value)).size).toBe(6);
  });

  it("falls back to the default column for an unknown value", () => {
    expect(parseSortValue("price:asc")).toEqual({ sort: "when", descending: false });
  });
});
