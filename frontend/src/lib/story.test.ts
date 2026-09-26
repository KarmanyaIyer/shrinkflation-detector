import { describe, expect, it } from "vitest";
import * as fx from "../api/fixtures";
import type { ChangeOut, Stats } from "../api/types";
import { buildStory, runsText, sizeCase } from "./story";

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
    expect(s.headline).toBe("Over 16 days at one Kroger, 38 prices rose, 36 fell and four listed sizes changed.");
  });

  it("leads the dek with the price data, naming the product before its shelf prices", () => {
    expect(s.dek).toEqual([
      "Of the 74 price moves, 57 were under 10% per unit. The largest: ",
      { product: fx.ids.reeses, text: "Reese's Puffs" },
      " went from $5.49 to $3.99, 27.3% less per ounce.",
    ]);
    expect(runsText(s.dek)).not.toMatch(/Huggies/);
  });

  it("dates the last run in the store timezone", () => {
    // The run classified 27 changes; 26 of them were published (one went to review).
    expect(s.freshness).toBe("Last checked Sep 23 at 7:07 a.m. Eastern: 27 changes flagged, 26 published.");
    expect(s.period).toBe("Sep 7 to 23, 2026");
    expect(s.source).toBe("Source: Kroger public product API, one Cincinnati-area Kroger, Sep 7 to 23, 2026.");
  });

  it("has six steps in order with text equivalents", () => {
    expect(s.steps.map((step) => step.kind)).toEqual(["grid", "changed", "swarm", "shrinks", "grows", "end"]);
    expect(s.steps[0]!.paragraphs[0]).toEqual([
      "Each dot is one product, grouped by category.",
      " Pantry is the largest group, with 276 items.",
    ]);
    expect(s.steps[1]!.paragraphs[0]).toEqual([
      "A change means a morning check found a different size or price than the check before it. That happened to ",
      { b: "78 products" },
      ".",
    ]);
    // 41 and 37 count products, including the four size changes; the headline counts price moves.
    expect(s.steps[1]!.paragraphs[1]).toEqual([
      "Color shows which way the price per unit went, counting the four listed size changes: ",
      { dot: "more" },
      "up for 41, ",
      { dot: "less" },
      "down for 37.",
    ]);
    expect(s.steps[2]!.paragraphs[0]).toEqual([{ b: "The median price move, up or down, was 6.0% per unit." }]);
    expect(s.steps[2]!.alt).toContain("Off the scale:");
    expect(s.steps[3]!.title).toBe("Listed size went down");
    expect(s.steps[3]!.paragraphs[0]).toEqual([
      { b: "The listed size went down on three products" },
      ", and all three kept the same shelf price.",
    ]);
    expect(s.steps[3]!.paragraphs[1]).toEqual([
      "The detector reads Kroger’s listing text, so a corrected listing and a smaller package look the same.",
      { fn: 2 },
    ]);
    expect(s.steps[4]!.title).toBe("Listed size went up");
    expect(s.steps[4]!.paragraphs[0]).toEqual([
      { b: "The listed size went up on one product" },
      ": “4.0 oz” to “5.0 oz” at the same $5.99",
      ", so the price per ounce fell 20.0%.",
    ]);
    // The record count lives in the method box only.
    expect(s.steps[5]!.paragraphs[0]).toEqual([
      { pick: true },
      " to open one product’s history, or ",
      { link: "#ask", text: "ask the data" },
      ".",
    ]);
    for (const step of s.steps) {
      expect(step.alt.length).toBeGreaterThan(20);
      // Screen reader descriptions use the cleaned names, without registered or trademark marks.
      expect(step.alt).not.toMatch(/\(R\)|\(TM\)|®|™/);
    }
  });

  it("puts the lede note first and explains how a text edit changes the reading", () => {
    expect(runsText(s.lede)).toBe(
      "Every morning, a job checks the listed size and regular shelf price of 1,242 grocery products at one Cincinnati-area Kroger. Changes are compared in price per unit, which rises when the shelf price goes up or the listed size goes down.",
    );
    expect(s.lede).toContainEqual({ fn: 1 });
    expect(s.sizeNote).toBe(
      "No package was measured. An edit to the listing text changes the reading: “2 ct / 8 oz each” was read as 16 oz and “2 ct / 8 oz” as 8 oz.",
    );
  });

  it("annotates the largest moves on the axis and lists the ones off it", () => {
    expect(s.annotations.up).toMatchObject({ id: fx.ids.kodiak, value: 23.11, line: "$6.49 to $7.99, +23.1% per oz" });
    expect(s.annotations.down).toMatchObject({ id: fx.ids.reeses, value: -27.32, label: "Reese's Puffs" });
    // The brand is not in this name, so the label is the full name, which the chart wraps.
    expect(s.annotations.up!.label).toBe("Kodiak Protein-Packed Buttermilk and Vanilla Frozen Thick and Fluffy Power Waffles");
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
    expect(s.grows[0]).toMatchObject({
      id: fx.ids.khloud,
      before: "4.0 oz",
      after: "5.0 oz",
      unitPct: -20,
      noteKind: "name",
      note: "The product name still says “4.0 oz”.",
    });
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
    expect(s.dek).toEqual(["The first check ran Sep 7, 2026."]);
    expect(s.steps.map((step) => step.kind)).toEqual(["grid", "changed", "swarm", "end"]);
    expect(s.steps[1]!.paragraphs).toHaveLength(1);
    expect(s.steps[2]!.title).toBe("Change in price per unit");
    expect(s.steps[2]!.paragraphs[0]).toEqual([{ b: "No change has been recorded yet, so the chart is empty." }]);
    expect(s.annotations).toEqual({ up: null, down: null });
    expect(s.freshness).toBe("Last checked Sep 7 at 6:57 p.m. Eastern: no size or price changes.");
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
    expect(runsText(one.dek)).toMatch(/^One shelf price moved: .+ went from \$\d+\.\d\d to \$\d+\.\d\d, \d+\.\d% more per (ounce|fluid ounce|item|square foot)\.$/);
    expect(one.steps[2]!.paragraphs[0]).toEqual([{ b: `The one price move was ${one.annotations.up!.percent.split(" ")[0]} per unit.` }]);

    const tied = rises.slice(0, 2).map((c) => ({ ...c, unit_price_change_pct: "9.90", price_change_pct: "9.90" }));
    const tie = story({ changes: tied });
    expect(runsText(tie.dek)).toBe("Both price moves were under 10% per unit. The largest move, +9.9% per unit, was shared by two products.");
    expect(tie.steps[2]!.paragraphs[0]).toEqual([{ b: "The two price moves were +9.9% and +9.9% per unit." }]);

    // A tie on magnitude across both directions carries no sign.
    const cut = fx.changes.find((c) => c.kind === "price_decrease")!;
    const split = [tied[0]!, { ...cut, unit_price_change_pct: "-9.90", price_change_pct: "-9.90" }];
    expect(runsText(story({ changes: split }).dek)).toBe(
      "Both price moves were under 10% per unit. The largest move, 9.9% per unit, was shared by two products, one up and one down.",
    );
    const big = tied.map((c) => ({ ...c, unit_price_change_pct: "12.00", price_change_pct: "12.00" }));
    expect(runsText(story({ changes: big }).dek)).toMatch(/^Neither price move was under 10% per unit\./);
  });

  it("writes counts as words the way the headline does, and never says zero were under", () => {
    const rises = fx.changes.filter((c) => c.kind === "price_increase");
    const at = (pcts: string[]) => rises.slice(0, pcts.length).map((c, i) => ({ ...c, unit_price_change_pct: pcts[i]!, price_change_pct: pcts[i]! }));
    expect(runsText(story({ changes: at(["12.00", "15.00", "20.00"]) }).dek)).toMatch(/^None of the three price moves was under 10% per unit\./);
    expect(runsText(story({ changes: at(["2.00", "3.00", "4.00"]) }).dek)).toMatch(/^All three price moves were under 10% per unit\./);
    expect(runsText(story({ changes: at(["2.00", "3.00", "14.00"]) }).dek)).toMatch(/^Of the three price moves, two were under 10% per unit\./);
    expect(runsText(story({ changes: at(["2.00", "13.00", "14.00"]) }).dek)).toMatch(/^Of the three price moves, one was under 10% per unit\./);
    for (const pcts of [["12.00", "15.00"], ["12.00", "15.00", "20.00"], ["2.00", "13.00"]]) {
      expect(runsText(story({ changes: at(pcts) }).dek)).not.toMatch(/\b0 were\b/);
    }
  });

  it("uses a product's newest change when it has two, and counts products, not changes", () => {
    const reeses = fx.changes.find((c) => c.product.id === fx.ids.reeses)!;
    // An older rise on the same product, detected a week before the captured drop.
    const older = {
      ...reeses,
      id: reeses.id - 1000,
      kind: "price_increase",
      unit_price_change_pct: "4.00",
      price_change_pct: "4.00",
      detected_at: "2026-09-10T11:05:00Z",
    };
    // The API sends newest first; the older change arrives last, where it used to win.
    const s = story({ changes: [...fx.changes, older] });
    expect(s.counts.changed).toBe(78);
    expect(s.counts.up + s.counts.down).toBe(78);
    expect(s.counts.down).toBe(37);
    expect(s.annotations.down!.id).toBe(fx.ids.reeses);
    // Price moves are events, so the extra one counts there.
    expect(s.counts.priceMoves).toBe(75);
    // Same data in the other order gives the same story.
    const reversed = story({ changes: [older, ...fx.changes] });
    expect(reversed.counts).toEqual(s.counts);
    expect(reversed.headline).toBe(s.headline);

    // A newer rise on the same product takes over its direction and its place on the chart.
    const newer = { ...older, id: reeses.id + 1000, detected_at: "2026-09-24T11:05:00Z" };
    const flipped = story({ changes: [newer, ...fx.changes] });
    expect(flipped.counts.changed).toBe(78);
    expect(flipped.counts).toMatchObject({ up: 42, down: 36 });
    expect(flipped.annotations.down!.id).not.toBe(fx.ids.reeses);
  });

  it("writes the size steps for sizes only", () => {
    const sizes = fx.changes.filter((c) => c.kind === "shrink" || c.kind === "grow");
    const s = story({ changes: sizes, stats: { ...fx.stats, price_increase_count: 0, price_decrease_count: 0, changes_published: 4 } });
    expect(s.headline).toBe("Over 16 days at one Kroger, no shelf price moved and four listed sizes changed.");
    // The headline has the count, so the dek dates the changes instead of repeating it.
    expect(s.dek).toEqual(["The first was seen Sep 16 and the latest Sep 22."]);
    expect(s.steps[2]!.paragraphs[0]).toEqual([{ b: "All four dots are listed size changes." }]);
    const grow = story({ changes: sizes.filter((c) => c.kind === "grow") });
    expect(grow.headline).toBe("Over 16 days at one Kroger, no shelf price moved and one listed size went up.");
    expect(grow.dek).toEqual(["It was seen Sep 22."]);
    const shrink = story({ changes: sizes.filter((c) => c.kind === "shrink") });
    expect(shrink.headline).toBe("Over 16 days at one Kroger, no shelf price moved and three listed sizes went down.");
  });

  it("says plainly when the run failed or the data is stale", () => {
    const failed = story({ stats: fx.failedRunStats, now: new Date("2026-09-24T12:00:00Z") });
    // A check with errors skips failed batches, so the line says how far it got.
    expect(failed.freshness).toBe("Last check Sep 24 at 7:02 a.m. Eastern covered 480 of 1,242 products.");
    const allRead = story({
      stats: { ...fx.failedRunStats, last_run: { ...fx.failedRunStats.last_run!, products_checked: 1242, errors: 2 } },
      now: new Date("2026-09-24T12:00:00Z"),
    });
    expect(allRead.freshness).toBe("Last check Sep 24 at 7:02 a.m. Eastern ended with two errors.");
    const stale = story({ now: new Date("2026-09-26T12:00:00Z") });
    expect(stale.freshness).toBe("Data last updated Sep 23 at 7:07 a.m. Eastern.");
    // An old failed check reads as old data, not as a failure of today's check.
    expect(story({ stats: fx.failedRunStats, now: new Date("2026-09-27T12:00:00Z") }).freshness).toBe(
      "Data last updated Sep 24 at 7:02 a.m. Eastern.",
    );
    const none = story({ stats: { ...fx.stats, last_run: null, tracking_since: null } });
    expect(none.freshness).toBe("No check has run yet.");
    // Changes the run classified but did not publish are not called found changes.
    const held = story({ changes: fx.changes.filter((c) => !c.detected_at.startsWith("2026-09-23")) });
    expect(held.freshness).toBe("Last checked Sep 23 at 7:07 a.m. Eastern: 27 changes flagged, none published.");
    const heldOne = story({
      stats: { ...fx.stats, last_run: { ...fx.stats.last_run!, changes_found: 1 } },
      changes: fx.changes.filter((c) => !c.detected_at.startsWith("2026-09-23")),
    });
    expect(heldOne.freshness).toBe("Last checked Sep 23 at 7:07 a.m. Eastern: one change flagged, not published.");
    const all = story({ stats: { ...fx.stats, last_run: { ...fx.stats.last_run!, changes_found: 26 } } });
    expect(all.freshness).toBe("Last checked Sep 23 at 7:07 a.m. Eastern: 26 size or price changes.");
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
    // The card already prints the shelf price, so a plain case adds no note.
    expect(sizeCase(lays)).toMatchObject({ noteKind: "plain", note: "" });
  });
});

describe("story copy at counts of 0, 1, 2 and 10", () => {
  const template = (kind: string) => fx.changes.find((c) => c.kind === kind)!;
  const pct: Record<string, string> = { price_increase: "4.00", price_decrease: "-3.00", shrink: "6.00", grow: "-5.00" };
  let serial = 0;
  // n changes of one kind, each on its own product, spread over the tracked days.
  function many(kind: string, n: number): ChangeOut[] {
    const base = template(kind);
    return Array.from({ length: n }, (_, i) => {
      serial += 1;
      const day = String(8 + ((serial * 3) % 15)).padStart(2, "0");
      return {
        ...base,
        id: 90000 + serial,
        product: { ...base.product, id: `99${String(serial).padStart(11, "0")}` },
        unit_price_change_pct: (Number(pct[kind]) + (Number(pct[kind]) < 0 ? -i : i) * 0.5).toFixed(2),
        detected_at: `2026-09-${day}T11:0${i % 10}:00Z`,
      };
    });
  }
  function mixed(up: number, down: number, shrinks: number, grows: number) {
    const changes = [...many("price_increase", up), ...many("price_decrease", down), ...many("shrink", shrinks), ...many("grow", grows)];
    const stats = {
      ...fx.stats,
      price_increase_count: up,
      price_decrease_count: down,
      shrink_count: shrinks,
      grow_count: grows,
      changes_published: changes.length,
    };
    return story({ stats, changes });
  }
  const counts = [0, 1, 2, 10];
  const combos: [number, number, number, number][] = [];
  for (const up of counts) for (const down of counts) for (const shrinks of counts) for (const grows of counts) combos.push([up, down, shrinks, grows]);

  it("writes each count the headline way", () => {
    expect(mixed(0, 0, 0, 0).headline).toBe("Over 16 days at one Kroger, no listed size or shelf price changed.");
    expect(mixed(1, 0, 0, 0).headline).toBe("Over 16 days at one Kroger, one price rose.");
    expect(mixed(2, 1, 0, 0).headline).toBe("Over 16 days at one Kroger, two prices rose and one fell.");
    expect(mixed(10, 10, 0, 0).headline).toBe("Over 16 days at one Kroger, 10 prices rose and 10 fell.");
    expect(mixed(0, 2, 1, 0).headline).toBe("Over 16 days at one Kroger, two prices fell and one listed size went down.");
    expect(mixed(1, 0, 0, 2).headline).toBe("Over 16 days at one Kroger, one price rose and two listed sizes went up.");
    expect(mixed(10, 2, 1, 1).headline).toBe("Over 16 days at one Kroger, 10 prices rose, two fell and two listed sizes changed.");
    expect(mixed(0, 0, 10, 10).headline).toBe("Over 16 days at one Kroger, no shelf price moved and 20 listed sizes changed.");
  });

  it("dates size-only stories and names the single price move", () => {
    expect(runsText(mixed(0, 0, 1, 0).dek)).toMatch(/^It was seen Sep \d+\.$/);
    expect(runsText(mixed(0, 0, 2, 0).dek)).toMatch(/^The first was seen Sep \d+ and the latest Sep \d+\.$|^Both were seen Sep \d+\.$/);
    expect(runsText(mixed(0, 1, 0, 0).dek)).toMatch(/^One shelf price moved: .+ went from \$\d+\.\d\d to \$\d+\.\d\d, \d+\.\d% less per /);
    expect(runsText(mixed(10, 10, 0, 0).dek)).toMatch(/^All 20 price moves were under 10% per unit\. The largest: /);
  });

  it("keeps size steps to the kinds that exist", () => {
    expect(mixed(1, 1, 0, 0).steps.map((s) => s.kind)).toEqual(["grid", "changed", "swarm", "end"]);
    expect(mixed(1, 1, 2, 0).steps.map((s) => s.kind)).toEqual(["grid", "changed", "swarm", "shrinks", "end"]);
    expect(mixed(0, 0, 0, 10).steps.map((s) => s.kind)).toEqual(["grid", "changed", "swarm", "grows", "end"]);
    expect(runsText(mixed(0, 0, 10, 0).steps[3]!.paragraphs[0]!)).toMatch(/^The listed size went down on 10 products/);
    expect(runsText(mixed(0, 0, 1, 0).steps[3]!.paragraphs[0]!)).toMatch(/^The listed size went down on one product\b/);
  });

  it("never writes zero, a bare digit at a sentence start, a singular mismatch or a dash", () => {
    const bad: string[] = [];
    for (const [up, down, shrinks, grows] of combos) {
      const s = mixed(up, down, shrinks, grows);
      const titles = s.steps.map((step) => step.title);
      const texts = [s.headline, runsText(s.dek), s.freshness, runsText(s.lede), ...s.steps.flatMap((step) => step.paragraphs.map(runsText))];
      for (const text of [...texts, ...titles]) {
        const problems = [
          /\bzero\b/i.test(text) && "zero",
          // Chart titles are labels, so they may start with a number; sentences may not.
          !titles.includes(text) && /(^|[.!?]\s+)\d/.test(text) && "digit starts a sentence",
          /\bAll (one|two)\b/.test(text) && "all one/two",
          /\bone (products|prices|changes|sizes|listed sizes|price moves|dots|items)\b/.test(text) && "one + plural",
          /\b(two|three|four|five|six|seven|eight|nine|[1-9]\d+) (product|price(?! move)|change|listed size(?! change)|price move|dot|item)\b/.test(text) && "count + singular",
          /[\u2013\u2014]/.test(text) && "dash",
          /undefined|null|NaN/.test(text) && "missing value",
          /\s{2,}|\s[.,:]/.test(text) && "spacing",
        ].filter(Boolean);
        if (problems.length) bad.push(`${up}/${down}/${shrinks}/${grows} ${problems.join(", ")}: ${text}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
