import { describe, expect, it } from "vitest";
import * as fx from "../api/fixtures";
import type { ChangeOut, Stats } from "../api/types";
import { MINUS } from "./format";
import { buildStory, sizeCase } from "./story";

const NOW = new Date("2026-09-23T15:00:00Z");

function story(overrides: { stats?: Stats; changes?: ChangeOut[]; now?: Date } = {}) {
  return buildStory({
    stats: overrides.stats ?? fx.stats,
    changes: overrides.changes ?? fx.changes,
    categories: fx.categories,
    now: overrides.now ?? NOW,
  });
}

describe("story copy from the captured data", () => {
  const s = story();

  it("counts the period in store days and the changes by kind and direction", () => {
    expect(s.counts).toMatchObject({
      products: 1242,
      changed: 78,
      priceUp: 38,
      priceDown: 36,
      priceMoves: 74,
      under10: 57,
      shrinks: 3,
      grows: 1,
      up: 41,
      down: 37,
      states: 1370,
      days: 16,
    });
  });

  it("writes the headline as a finding, with words for small numbers and the size wording", () => {
    expect(s.headline).toBe(
      "Over 16 days at one Kroger, 38 prices rose, 36 fell and the listed size went down on three.",
    );
  });

  it("leads the dek with the price data, not the size cases", () => {
    expect(s.dek).toBe(
      `Of the 74 price moves, 57 were under 10% per unit. The largest was General Mills Reese's Puffs Chocolatey Peanut Butter Cereal, $5.49 to $3.99, ${MINUS}27.3% per oz.`,
    );
    expect(s.dek).not.toMatch(/Huggies/);
  });

  it("dates the last run in the store timezone", () => {
    expect(s.freshness).toBe("Last checked Sep 23 at 7:07 a.m. Eastern. That check found 27 size or price changes.");
    expect(s.period).toBe("Sep 7 to 23, 2026");
    expect(s.source).toBe("Source: Kroger public product API, one Cincinnati-area Kroger, Sep 7 to 23, 2026.");
  });

  it("has six steps in order with text equivalents", () => {
    expect(s.steps.map((step) => step.kind)).toEqual(["grid", "changed", "swarm", "shrinks", "grows", "end"]);
    expect(s.steps[0]!.paragraphs[0]).toEqual([
      "Each dot is one product, grouped by category.",
      " Pantry is the largest group, with 276 items. Candy is the smallest, with 36.",
    ]);
    expect(s.steps[1]!.paragraphs[0]).toEqual([
      "A change means a morning check found a different size or price than the check before it. That happened to ",
      { b: "78 products" },
      ".",
    ]);
    expect(s.steps[1]!.paragraphs[1]).toEqual([
      "Color shows which way the price per unit went: ",
      { dot: "more" },
      "up for 41, ",
      { dot: "less" },
      "down for 37.",
    ]);
    expect(s.steps[2]!.paragraphs[0]).toEqual([
      "Shelf prices moved both ways: ",
      { b: "38 went up and 36 came down." },
      " Of those 74 moves, 57 were under 10% per unit.",
    ]);
    expect(s.steps[2]!.alt).toContain("Off the scale:");
    expect(s.steps[3]!.paragraphs[0]).toEqual([
      { b: "The listed size went down on three products" },
      "; the shelf price stayed the same on all three.",
    ]);
    expect(s.steps[3]!.paragraphs[1]).toEqual([
      "On two of them the new text dropped a pack count or the word “each”. ",
      "The detector reads Kroger’s listing text, so a corrected listing and a smaller package look the same.",
      { fn: 1 },
    ]);
    expect(s.steps[4]!.paragraphs[0]).toEqual([
      { b: "The listed size went up on one product" },
      ": Khloud White Cheddar Protein Popcorn 4.0 oz, “4.0 oz” to “5.0 oz” at the same $5.99",
      ", so the price per oz fell 20.0%.",
    ]);
    expect(s.steps[5]!.paragraphs[0]).toEqual([
      "That is the whole record so far: 1,370 stored states across 1,242 products. ",
      { pick: true },
      " to open one product’s history, or ",
      { link: "#ask", text: "ask the data" },
      ".",
    ]);
    for (const step of s.steps) expect(step.alt.length).toBeGreaterThan(20);
  });

  it("annotates the largest moves on the axis and lists the ones off it", () => {
    expect(s.annotations.up).toMatchObject({ id: fx.ids.kodiak, value: 23.11, line: "$6.49 to $7.99, +23.1% per oz" });
    expect(s.annotations.down).toMatchObject({ id: fx.ids.reeses, value: -27.32 });
    expect(s.annotations.down!.short).toBe("General Mills Reese's Puffs…");
    expect(s.offScale.map((a) => a.id)).toEqual([fx.ids.philadelphia, fx.ids.dove, fx.ids.huggies]);
  });

  it("describes each size case from its own label texts, without naming products in code", () => {
    expect(s.shrinks.map((c) => [c.id, c.noteKind])).toEqual([
      [fx.ids.huggies, "half"],
      [fx.ids.philadelphia, "each"],
      [fx.ids.dove, "pack"],
    ]);
    const huggies = s.shrinks[0]!;
    expect(huggies).toMatchObject({
      before: "192 ct",
      after: "56 ct",
      priceAfter: "$6.99",
      samePrice: true,
      unitPct: 242.86,
      unit: "each",
      when: "Sep 15 to 16",
      note: "The listed count fell by more than half at the same shelf price.",
    });
    expect(s.shrinks[1]!.note).toBe("The earlier text said “each”; the new text does not.");
    expect(s.shrinks[2]!.note).toBe("The earlier text had a pack count; the new text does not.");
    expect(s.grows[0]).toMatchObject({ id: fx.ids.khloud, before: "4.0 oz", after: "5.0 oz", unitPct: -20 });
  });

  it("collects the method numbers from stats and the last run", () => {
    expect(s.method).toMatchObject({
      products: 1242,
      apiCalls: 25,
      runDate: "Sep 23",
      runSpan: "6 minutes 41 seconds",
      runChecked: 1242,
      runErrors: 0,
      runOk: true,
      llmCalls: 433,
      llmCost: "$0.08",
      states: 1370,
      published: 78,
      shrinkPriceCuts: 0,
    });
  });
});

describe("story copy in other states", () => {
  it("handles day one: nothing has changed yet", () => {
    const s = story({ stats: fx.dayOneStats, changes: [], now: new Date("2026-09-08T00:00:00Z") });
    expect(s.headline).toBe("Over one day at one Kroger, no listed size or shelf price changed.");
    expect(s.dek).toBe("Neither the listed size nor the regular shelf price of any tracked product changed.");
    expect(s.steps.map((step) => step.kind)).toEqual(["grid", "changed", "swarm", "end"]);
    expect(s.steps[1]!.paragraphs).toHaveLength(1);
    expect(s.steps[2]!.paragraphs[0]).toEqual([{ b: "No shelf price changed." }]);
    expect(s.annotations).toEqual({ up: null, down: null });
    expect(s.freshness).toBe("Last checked Sep 7 at 6:57 p.m. Eastern. That check found no size or price changes.");
  });

  it("drops the size steps when there are only price moves", () => {
    const s = story({ stats: fx.priceOnlyStats, changes: fx.priceOnlyChanges });
    expect(s.headline).toBe("Over 16 days at one Kroger, 38 prices rose and 36 fell.");
    expect(s.steps.map((step) => step.kind)).toEqual(["grid", "changed", "swarm", "end"]);
    expect(s.offScale).toEqual([]);
  });

  it("handles a single direction, a single move, and a tie for the largest move", () => {
    const rises = fx.changes.filter((c) => c.kind === "price_increase");
    const one = story({ changes: rises.slice(0, 1) });
    expect(one.headline).toBe("Over 16 days at one Kroger, one price rose.");
    expect(one.dek).toMatch(/^One shelf price moved: .+, \$\d+\.\d\d to \$\d+\.\d\d, \+\d+\.\d% per (oz|fl oz|item|sq ft)\.$/);
    expect(one.steps[2]!.paragraphs[0]).toEqual([{ b: "All 1 price move was increases." }]);

    const tied = rises.slice(0, 2).map((c) => ({ ...c, unit_price_change_pct: "9.90", price_change_pct: "9.90" }));
    const tie = story({ changes: tied });
    expect(tie.dek).toBe("Of the 2 price moves, two were under 10% per unit. Two products tied for the largest move at +9.9% per unit.");
  });

  it("writes the size steps for sizes only", () => {
    const sizes = fx.changes.filter((c) => c.kind === "shrink" || c.kind === "grow");
    const s = story({ changes: sizes, stats: { ...fx.stats, price_increase_count: 0, price_decrease_count: 0, changes_published: 4 } });
    expect(s.headline).toBe("Over 16 days at one Kroger, no shelf price changed and the listed size went down on three.");
    expect(s.dek).toBe("No regular shelf price changed. The listed size changed on four products.");
    const grow = story({ changes: sizes.filter((c) => c.kind === "grow") });
    expect(grow.headline).toBe("Over 16 days at one Kroger, no shelf price changed and the listed size went up on one.");
  });

  it("says plainly when the run failed or the data is stale", () => {
    const failed = story({ stats: fx.failedRunStats, now: new Date("2026-09-24T12:00:00Z") });
    expect(failed.freshness).toBe(
      "The last check, Sep 24 at 7:02 a.m. Eastern, ended with 15 errors after 480 of 1,242 products. Figures are from the last complete check.",
    );
    const stale = story({ now: new Date("2026-09-26T12:00:00Z") });
    expect(stale.freshness).toBe("Data last updated Sep 23 at 7:07 a.m. Eastern.");
    const none = story({ stats: { ...fx.stats, last_run: null, tracking_since: null } });
    expect(none.freshness).toBe("No check has run yet.");
    expect(none.period).toBe("");
  });

  it("writes a plain note when a size case has no textual clue", () => {
    const lays = {
      ...fx.changes.find((c) => c.kind === "grow")!,
      kind: "shrink",
      size_change_pct: "-3.13",
      unit_price_change_pct: "3.23",
      before: { ...fx.changes.find((c) => c.kind === "grow")!.before!, size_text: "8 oz", display_quantity: "8" },
      after: { ...fx.changes.find((c) => c.kind === "grow")!.after!, size_text: "7.75 oz", display_quantity: "7.75" },
    };
    expect(sizeCase(lays)).toMatchObject({ noteKind: "plain", note: "Same shelf price on both dates." });
  });
});
