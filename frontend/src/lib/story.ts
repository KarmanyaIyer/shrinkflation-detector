// Every sentence on the article page that depends on the data is written here from the API
// responses, so the copy can be unit tested against the current data and against edge cases
// (nothing changed yet, no size changes, a tie for the largest move, a failed run).
//
// Counting rules: price moves are counted as events ("38 prices rose"); everything drawn as a
// dot is counted per product, by the product's newest change, so the words match the graphic
// when one product changed more than once.

import type { CategoryCount, ChangeOut, Stats } from "../api/types";
import { latestByProduct, unitChangePct } from "./changes";
import {
  countNoun,
  daysBetween,
  formatDate,
  formatDateShort,
  formatInt,
  formatMoney,
  formatPercent,
  formatQuantity,
  formatSpan,
  formatTime,
  numberWord,
  quoted,
  roundDecimal,
  toNumber,
  unitWord,
} from "./format";
import { direction, SIZE_KINDS } from "./kinds";
import { isOffScale } from "./swarm";
import { displayName, joinProse, proseName } from "./text";

export interface StoryInput {
  stats: Stats;
  changes: ChangeOut[];
  categories: CategoryCount[];
  now: Date;
}

export type StepKind = "grid" | "changed" | "swarm" | "shrinks" | "grows" | "end";

// Paragraphs are built from runs so the component can set bold text, color dots, footnote
// markers, product links, and the pointer-dependent verb without the copy module knowing JSX.
export type Run =
  | string
  | { b: string }
  | { dot: "more" | "less" }
  | { fn: number }
  | { link: string; text: string }
  | { product: string; text: string }
  | { pick: true };

export interface StoryStep {
  kind: StepKind;
  paragraphs: Run[][];
  // Visually hidden text equivalent of what the graphic shows at this step.
  alt: string;
  title: string;
}

export interface SizeCase {
  id: string;
  name: string;
  // The name as running prose calls it (the brand when that is unambiguous).
  prose: string;
  kind: string;
  before: string;
  after: string;
  // The quantities the size text was read as, such as "16 oz", when the reading has one.
  readBefore: string | null;
  readAfter: string | null;
  priceBefore: string | null;
  priceAfter: string | null;
  samePrice: boolean;
  unitPct: number | null;
  unitBefore: string | null;
  unitAfter: string | null;
  unit: string;
  quantityBefore: number | null;
  quantityAfter: number | null;
  when: string;
  // What the label texts or the product name show, written from the texts themselves. Empty
  // when there is nothing beyond the numbers the card already prints.
  note: string;
  noteKind: "pack" | "each" | "name" | "half" | "plain";
}

export interface Annotation {
  id: string;
  name: string;
  // The label name: the prose name when it is short, else the full display name, which the
  // chart wraps.
  label: string;
  value: number;
  line: string;
  // The price part and the percent part of `line`, for layouts that put them on two rows.
  price: string;
  percent: string;
}

export interface StoryCounts {
  products: number;
  categories: number;
  // Products with at least one published change.
  changed: number;
  // Products whose newest change raised or lowered the price per unit.
  up: number;
  down: number;
  // Price moves as events.
  priceUp: number;
  priceDown: number;
  priceMoves: number;
  under10: number;
  // Products whose listed size went down or up.
  shrinks: number;
  grows: number;
  states: number;
  days: number;
}

export interface MethodFacts {
  products: number;
  categories: number;
  apiCalls: number | null;
  runDate: string | null;
  runSpan: string | null;
  runChecked: number | null;
  runErrors: number | null;
  runOk: boolean;
  llmCalls: number;
  llmCost: string;
  states: number;
  published: number;
  priceUp: number;
  priceDown: number;
  shrinks: number;
  grows: number;
  shrinkPriceCuts: number;
}

export interface Story {
  counts: StoryCounts;
  kicker: string;
  headline: string;
  dek: Run[];
  lede: Run[];
  freshness: string;
  period: string;
  source: string;
  steps: StoryStep[];
  annotations: { up: Annotation | null; down: Annotation | null };
  offScale: Annotation[];
  shrinks: SizeCase[];
  grows: SizeCase[];
  // The note behind the size step's footnote marker.
  sizeNote: string;
  method: MethodFacts;
}

const HOURS_36 = 36 * 3_600_000;

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// "27.3%" without a sign, for prose that says the direction in words.
function percentWord(value: number): string {
  return `${roundDecimal(Math.abs(value), 1)}%`;
}

function priceBefore(change: ChangeOut): string | null {
  return formatMoney(change.before?.price_regular);
}

function priceAfter(change: ChangeOut): string | null {
  return formatMoney(change.after?.price_regular);
}

// "$5.49 to $3.99" for a price move, the one price when it did not move.
function priceLine(change: ChangeOut): string {
  const before = priceBefore(change);
  const after = priceAfter(change);
  if (before && after && before !== after) return `${before} to ${after}`;
  return after ?? before ?? "";
}

function unitOf(change: ChangeOut): string | null {
  return change.after?.unit_price?.unit ?? change.before?.unit_price?.unit ?? null;
}

// "price per oz" when the change carries a price per unit, "shelf price" when it does not.
function measureWords(change: ChangeOut): string {
  return toNumber(change.unit_price_change_pct) !== null ? `price per ${unitWord(unitOf(change))}` : "shelf price";
}

type Namer = (change: ChangeOut) => string;

function annotation(change: ChangeOut, prose: Namer): Annotation {
  const value = unitChangePct(change) ?? 0;
  const name = change.product.description;
  const unit = unitOf(change);
  const price = priceLine(change);
  const percent = `${formatPercent(value)}${unit ? ` per ${unitWord(unit)}` : ""}`;
  return {
    id: change.product.id,
    name,
    label: prose(change),
    value,
    price,
    percent,
    line: price ? `${price}, ${percent}` : percent,
  };
}

const PACK = /\b\d+\s*(pk|pack|packs|ct|count)\b\s*\//i;
const EACH = /\beach\b/i;

function contains(haystack: string, needle: string): boolean {
  return needle.trim() !== "" && haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

export function sizeCase(change: ChangeOut, prose: Namer = (c) => displayName(c.product.description)): SizeCase {
  const before = change.before;
  const after = change.after;
  const beforeText = before?.size_text ?? "";
  const afterText = after?.size_text ?? "";
  const pb = priceBefore(change);
  const pa = priceAfter(change);
  const samePrice = pb !== null && pb === pa;
  const unit = unitOf(change) ?? "";
  const sizePct = toNumber(change.size_change_pct);
  const name = displayName(change.product.description);
  const measured = unit === "each" ? "count" : "size";

  let noteKind: SizeCase["noteKind"] = "plain";
  let note = "";
  if (PACK.test(beforeText) && !PACK.test(afterText)) {
    noteKind = "pack";
    note = "The earlier text had a pack count; the new text does not.";
  } else if (EACH.test(beforeText) && !EACH.test(afterText)) {
    noteKind = "each";
    note = "The earlier text said “each”; the new text does not.";
  } else if (contains(name, beforeText) && !contains(name, afterText)) {
    noteKind = "name";
    note = `The product name still says ${quoted(beforeText)}.`;
  } else if (sizePct !== null && sizePct <= -50 && samePrice) {
    noteKind = "half";
    note = `The listed ${measured} fell by more than half at the same shelf price.`;
  } else if (sizePct !== null && sizePct >= 50 && samePrice) {
    noteKind = "half";
    note = `The listed ${measured} rose by half or more at the same shelf price.`;
  }

  return {
    id: change.product.id,
    name: change.product.description,
    prose: prose(change),
    kind: change.kind,
    before: beforeText,
    after: afterText,
    readBefore: formatQuantity(before?.display_quantity, before?.display_unit),
    readAfter: formatQuantity(after?.display_quantity, after?.display_unit),
    priceBefore: pb,
    priceAfter: pa,
    samePrice,
    unitPct: toNumber(change.unit_price_change_pct),
    unitBefore: before?.unit_price ? `$${Number(before.unit_price.value).toFixed(3)}` : null,
    unitAfter: after?.unit_price ? `$${Number(after.unit_price.value).toFixed(3)}` : null,
    unit,
    quantityBefore: toNumber(before?.display_quantity),
    quantityAfter: toNumber(after?.display_quantity),
    when: dateRange(change.before_seen_at, change.after_seen_at),
    note,
    noteKind,
  };
}

// "Sep 15 to 16", "Sep 30 to Oct 1", or one date.
function dateRange(from: string | null | undefined, to: string | null | undefined): string {
  const a = formatDateShort(from);
  const b = formatDateShort(to);
  if (a && b && a !== b) {
    const [am, ad] = a.split(" ");
    const [bm, bd] = b.split(" ");
    return am === bm ? `${am} ${ad} to ${bd}` : `${a} to ${b}`;
  }
  return a ?? b ?? "";
}

function headlineFor(counts: StoryCounts): string {
  const span = `Over ${countNoun(Math.max(1, counts.days), "day")} at one Kroger`;
  const parts: string[] = [];
  if (counts.priceUp && counts.priceDown) {
    parts.push(`${countNoun(counts.priceUp, "price")} rose`, `${numberWord(counts.priceDown)} fell`);
  } else if (counts.priceUp) {
    parts.push(`${countNoun(counts.priceUp, "price")} rose`);
  } else if (counts.priceDown) {
    parts.push(`${countNoun(counts.priceDown, "price")} fell`);
  }
  if (counts.shrinks && counts.grows) {
    parts.push(`the listed size went down on ${numberWord(counts.shrinks)} and up on ${numberWord(counts.grows)}`);
  } else if (counts.shrinks) {
    parts.push(`the listed size went down on ${numberWord(counts.shrinks)}`);
  } else if (counts.grows) {
    parts.push(`the listed size went up on ${numberWord(counts.grows)}`);
  }
  if (parts.length === 0) return `${span}, no listed size or shelf price changed.`;
  if (!counts.priceUp && !counts.priceDown) parts.unshift("no shelf price changed");
  return `${span}, ${joinProse(parts)}.`;
}

// "Of the 74 price moves, 57 were under 10% per unit", with the zero, one, and all cases.
function under10Sentence(moves: number, under: number): string {
  if (under === 0) {
    return moves === 2 ? "Neither price move was under 10% per unit." : `None of the ${numberWord(moves)} price moves was under 10% per unit.`;
  }
  if (under === moves) {
    return moves === 2 ? "Both price moves were under 10% per unit." : `All ${numberWord(moves)} price moves were under 10% per unit.`;
  }
  return `Of the ${numberWord(moves)} price moves, ${numberWord(under)} ${under === 1 ? "was" : "were"} under 10% per unit.`;
}

// "a 27.3% drop in price per oz, from $5.49 to $3.99, on " + the product.
function largestMove(change: ChangeOut, prose: Namer): Run[] {
  const pct = unitChangePct(change) ?? 0;
  const pb = priceBefore(change);
  const pa = priceAfter(change);
  const prices = pb && pa && pb !== pa ? `, from ${pb} to ${pa},` : "";
  return [
    `a ${percentWord(pct)} ${pct > 0 ? "rise" : "drop"} in ${measureWords(change)}${prices} on `,
    { product: change.product.id, text: prose(change) },
    ".",
  ];
}

function dekFor(counts: StoryCounts, priceMoves: ChangeOut[], prose: Namer): Run[] {
  if (priceMoves.length === 0) {
    const sizes = counts.shrinks + counts.grows;
    if (sizes === 0) return ["Neither the listed size nor the regular shelf price of any tracked product changed."];
    return [`No regular shelf price changed. The listed size changed on ${countNoun(sizes, "product")}.`];
  }
  const largest = Math.max(...priceMoves.map((change) => Math.abs(unitChangePct(change) ?? 0)));
  const winners = priceMoves.filter((change) => Math.abs(unitChangePct(change) ?? 0) === largest);
  if (priceMoves.length === 1) return ["One shelf price moved: ", ...largestMove(priceMoves[0]!, prose)];
  const lead = under10Sentence(priceMoves.length, counts.under10);
  if (winners.length === 1) return [`${lead} The largest was `, ...largestMove(winners[0]!, prose)];
  // Ties are on magnitude, so the sign is only shown when every tied move points the same way.
  const signs = new Set(winners.map((change) => Math.sign(unitChangePct(change) ?? 0)));
  const value = signs.size === 1 ? formatPercent(unitChangePct(winners[0]!)) : `${percentWord(largest)} either way`;
  return [`${lead} ${capitalize(countNoun(winners.length, "product"))} tied for the largest move, at ${value} per unit.`];
}

// run.changes_found counts every change the check classified, including ones held for review or
// hidden as noise, so the line also says how many of them were published.
function freshnessFor(stats: Stats, changes: ChangeOut[], now: Date): string {
  const run = stats.last_run;
  if (!run) return "No check has run yet.";
  const at = run.finished_at ?? run.started_at;
  const date = formatDateShort(at) ?? "";
  const time = formatTime(at) ?? "";
  const when = `${date} at ${time} Eastern`;
  if (run.status !== "ok") {
    const checked = `${formatInt(run.products_checked)} of ${formatInt(stats.products_tracked)} products`;
    return `The last check, ${when}, ended with ${countNoun(run.errors, "error")} after ${checked}. Figures include everything recorded so far.`;
  }
  const age = now.getTime() - new Date(at).getTime();
  if (age > HOURS_36) return `Data last updated ${when}.`;
  const start = new Date(run.started_at).getTime();
  const end = new Date(at).getTime();
  const published = changes.filter((change) => {
    const t = new Date(change.detected_at).getTime();
    return t >= start && t <= end;
  }).length;
  let found: string;
  if (run.changes_found === 0) found = "That check found no size or price changes.";
  else if (published >= run.changes_found) found = `That check found ${countNoun(published, "size or price change")}.`;
  else if (published === 0) found = `That check flagged ${countNoun(run.changes_found, "change")}, none of which passed the publish rule.`;
  else found = `That check found ${countNoun(run.changes_found, "size or price change")} and published ${numberWord(published)}.`;
  return `Last checked ${when}. ${found}`;
}

function periodFor(stats: Stats, changes: ChangeOut[]): { period: string; last: string | null } {
  const last = stats.last_run?.finished_at ?? stats.last_run?.started_at ?? null;
  const first = stats.tracking_since ?? changes.map((c) => c.before_seen_at ?? c.detected_at).sort()[0] ?? null;
  if (!first || !last) return { period: "", last };
  const a = formatDate(first)!;
  const b = formatDate(last)!;
  const [am, ad, ay] = a.replace(",", "").split(" ");
  const [bm, bd, by] = b.replace(",", "").split(" ");
  if (ay === by) {
    if (am === bm) return { period: ad === bd ? `${am} ${ad}, ${ay}` : `${am} ${ad} to ${bd}, ${ay}`, last };
    return { period: `${am} ${ad} to ${bm} ${bd}, ${ay}`, last };
  }
  return { period: `${a} to ${b}`, last };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function caseAlt(c: SizeCase): string {
  return `${displayName(c.name)}: ${quoted(c.before)} to ${quoted(c.after)} at ${c.priceAfter ?? "no price"}, price per ${unitWord(c.unit)} ${
    formatPercent(c.unitPct) ?? "unchanged"
  }, ${c.when}.`;
}

// "all three", "both", "it": the pronoun for every item of a group of `n`.
function every(n: number): string {
  return n === 1 ? "it" : n === 2 ? "both" : `all ${numberWord(n)}`;
}

// The sentences that say what the label texts show across a group of size cases.
function textEvidence(cases: SizeCase[]): string[] {
  const out: string[] = [];
  const textual = cases.filter((c) => c.noteKind === "pack" || c.noteKind === "each").length;
  const named = cases.filter((c) => c.noteKind === "name");
  if (textual) {
    out.push(
      textual === cases.length
        ? `On ${cases.length === 1 ? "it" : cases.length === 2 ? "both" : "each one"} the new text dropped a pack count or the word “each”.`
        : `On ${numberWord(textual)} of them the new text dropped a pack count or the word “each”.`,
    );
  }
  if (named.length === 1 && cases.length === 1) out.push(`Its product name still says ${quoted(named[0]!.before)}.`);
  else if (named.length) out.push(`On ${numberWord(named.length)} of them the product name still gives the earlier size.`);
  return out;
}

export function buildStory(input: StoryInput): Story {
  const { stats, changes, categories, now } = input;
  const latest = latestByProduct(changes);
  const latestList = [...latest.values()];
  const priceMoves = changes.filter((change) => !SIZE_KINDS.has(change.kind));
  const shrinkChanges = [...latestByProduct(changes.filter((c) => c.kind === "shrink" || c.kind === "shrink_price_cut")).values()];
  const growChanges = [...latestByProduct(changes.filter((c) => c.kind === "grow")).values()];
  const { period, last } = periodFor(stats, changes);
  const days = stats.tracking_since && last ? daysBetween(stats.tracking_since, last) : 0;

  // A brand only stands in for a long name when no other changed product carries it.
  const prose: Namer = (change) =>
    proseName(
      change.product.description,
      change.product.brand,
      latestList.filter((other) => other.product.id !== change.product.id).map((other) => other.product.description),
    );

  const counts: StoryCounts = {
    products: stats.products_tracked,
    categories: stats.categories,
    changed: latest.size,
    up: latestList.filter((change) => direction(change) === "more").length,
    down: latestList.filter((change) => direction(change) === "less").length,
    priceUp: priceMoves.filter((change) => change.kind === "price_increase").length,
    priceDown: priceMoves.filter((change) => change.kind === "price_decrease").length,
    priceMoves: priceMoves.length,
    under10: priceMoves.filter((change) => Math.abs(unitChangePct(change) ?? 0) < 10).length,
    shrinks: shrinkChanges.length,
    grows: growChanges.length,
    states: stats.snapshots,
    days,
  };

  const withPct = latestList.filter((change) => unitChangePct(change) !== null);
  const inScale = withPct.filter((change) => !isOffScale(unitChangePct(change)!));
  const up = inScale.filter((c) => unitChangePct(c)! > 0).sort((a, b) => unitChangePct(b)! - unitChangePct(a)!)[0] ?? null;
  const down = inScale.filter((c) => unitChangePct(c)! < 0).sort((a, b) => unitChangePct(a)! - unitChangePct(b)!)[0] ?? null;
  const offScale = withPct
    .filter((change) => isOffScale(unitChangePct(change)!))
    .sort((a, b) => unitChangePct(a)! - unitChangePct(b)!)
    .map((change) => annotation(change, prose));

  const shrinks = shrinkChanges.map((c) => sizeCase(c, prose)).sort((a, b) => (b.unitPct ?? 0) - (a.unitPct ?? 0));
  const grows = growChanges.map((c) => sizeCase(c, prose)).sort((a, b) => (a.unitPct ?? 0) - (b.unitPct ?? 0));

  const sortedCats = [...categories].sort((a, b) => b.products - a.products || a.category.localeCompare(b.category));
  const largest = sortedCats[0];
  const smallest = sortedCats[sortedCats.length - 1];

  const steps: StoryStep[] = [];

  // 1. Every product by category.
  const gridText: Run[] = ["Each dot is one product, grouped by category."];
  if (largest && smallest && largest !== smallest) {
    gridText.push(
      ` ${largest.category} is the largest group, with ${numberWord(largest.products)} items. ${smallest.category} is the smallest, with ${numberWord(smallest.products)}.`,
    );
  }
  steps.push({
    kind: "grid",
    title: `${formatInt(counts.products)} products, by category`,
    paragraphs: [gridText],
    alt: `${formatInt(counts.products)} dots in ${countNoun(sortedCats.length, "category", "categories")}: ${sortedCats
      .map((c) => `${c.category} ${formatInt(c.products)}`)
      .join(", ")}.`,
  });

  // 2. The changed ones light up.
  const changedText: Run[][] = [];
  if (counts.changed === 0) {
    changedText.push([
      "A change means a morning check found a different size or price than the check before it. No check has found one yet.",
    ]);
  } else {
    changedText.push([
      "A change means a morning check found a different size or price than the check before it. That happened to ",
      { b: countNoun(counts.changed, "product") },
      ".",
    ]);
    changedText.push([
      "Color shows which way the price per unit went: ",
      { dot: "more" },
      `up for ${numberWord(counts.up)}, `,
      { dot: "less" },
      `down for ${numberWord(counts.down)}.`,
    ]);
  }
  const withChanges = sortedCats.filter((c) => c.changes > 0);
  steps.push({
    kind: "changed",
    title: "Products with a recorded change",
    paragraphs: changedText,
    alt:
      counts.changed === 0
        ? "No product is highlighted: nothing has changed yet."
        : `The ${formatInt(counts.changed)} changed products highlighted in their category rows: ${withChanges
            .map((c) => `${c.category} ${c.changes}`)
            .join(", ")}.`,
  });

  // 3. Beeswarm of unit price change.
  const swarmText: Run[] = [];
  if (counts.priceUp && counts.priceDown) {
    swarmText.push("Shelf prices moved both ways: ", {
      b: `${numberWord(counts.priceUp)} went up and ${numberWord(counts.priceDown)} came down.`,
    });
  } else if (counts.priceUp || counts.priceDown) {
    const n = counts.priceUp || counts.priceDown;
    swarmText.push({
      b:
        n === 1
          ? `The one price move was ${counts.priceUp ? "an increase" : "a cut"}.`
          : `All ${numberWord(n)} price moves were ${counts.priceUp ? "increases" : "cuts"}.`,
    });
  } else {
    swarmText.push({ b: "No shelf price changed." });
  }
  const mid = counts.priceMoves >= 3 ? median(priceMoves.map((change) => Math.abs(unitChangePct(change) ?? 0))) : null;
  if (mid !== null) swarmText.push(` The median move, up or down, was ${percentWord(mid)} per unit.`);
  const sizeDots = latestList.filter((change) => SIZE_KINDS.has(change.kind)).length;
  if (sizeDots) {
    const other = counts.priceMoves ? "other " : "";
    swarmText.push(
      sizeDots === 1 ? ` The ${other}dot is a listed size change.` : ` The ${other}${numberWord(sizeDots)} dots are listed size changes.`,
    );
  }
  const upA = up ? annotation(up, prose) : null;
  const downA = down ? annotation(down, prose) : null;
  const swarmAlt = [
    "Each changed product placed by its change in price per unit.",
    upA ? `Largest increase on the axis: ${displayName(upA.name)}, ${upA.line}.` : "",
    downA ? `Largest decrease on the axis: ${displayName(downA.name)}, ${downA.line}.` : "",
    offScale.length ? `Off the scale: ${offScale.map((a) => `${displayName(a.name)}, ${a.line}`).join("; ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  steps.push({
    kind: "swarm",
    title: `Change in price per unit, ${countNoun(counts.changed, "product")}`,
    paragraphs: [swarmText],
    alt: swarmAlt,
  });

  // 4. Size decreases, with their label texts.
  if (shrinks.length) {
    const same = shrinks.filter((c) => c.samePrice).length;
    const first: Run[] = [
      { b: `The listed size went down on ${countNoun(shrinks.length, "product")}` },
      same === shrinks.length
        ? `; the shelf price stayed the same on ${every(shrinks.length)}.`
        : same
          ? `; the shelf price stayed the same on ${numberWord(same)} of them.`
          : ".",
    ];
    const evidence = textEvidence(shrinks);
    const second: Run[] = [
      ...evidence.map((sentence) => `${sentence} `),
      "The detector reads Kroger’s listing text, so a corrected listing and a smaller package look the same.",
      { fn: 2 },
    ];
    steps.push({
      kind: "shrinks",
      title: "Listings whose size text went down",
      paragraphs: [first, second],
      alt: shrinks.map(caseAlt).join(" "),
    });
  }

  // 5. Size increases. The card beside the text names the product, so the text leads with the
  // size change itself.
  if (grows.length) {
    const text: Run[] = [{ b: `The listed size went up on ${countNoun(grows.length, "product")}` }];
    if (grows.length === 1) {
      const only = grows[0]!;
      const price = only.samePrice ? `the same ${only.priceAfter}` : `${only.priceBefore} to ${only.priceAfter}`;
      text.push(
        `: ${quoted(only.before)} to ${quoted(only.after)} at ${price}`,
        only.unitPct !== null && only.unitPct < 0 ? `, so the price per ${unitWord(only.unit)} fell ${percentWord(only.unitPct)}.` : ".",
      );
    } else {
      text.push(`: ${grows.map((c) => `${c.prose}, ${quoted(c.before)} to ${quoted(c.after)}`).join("; ")}.`);
    }
    for (const sentence of textEvidence(grows)) text.push(` ${sentence}`);
    steps.push({
      kind: "grows",
      title: "Listings whose size text went up",
      paragraphs: [text],
      alt: grows.map(caseAlt).join(" "),
    });
  }

  // 6. Back to the whole record.
  steps.push({
    kind: "end",
    title: `${formatInt(counts.products)} products, by category`,
    paragraphs: [
      [
        `The job has stored ${formatInt(counts.states)} records for these ${formatInt(counts.products)} products so far. `,
        { pick: true },
        " to open one product’s history, or ",
        { link: "#ask", text: "ask the data" },
        ".",
      ],
    ],
    alt: `All ${formatInt(counts.products)} products by category again, with the ${formatInt(counts.changed)} changed ones in color.`,
  });

  const run = stats.last_run;
  const runSpan =
    run?.finished_at && run.started_at
      ? formatSpan(new Date(run.finished_at).getTime() - new Date(run.started_at).getTime())
      : null;
  const method: MethodFacts = {
    products: stats.products_tracked,
    categories: stats.categories,
    apiCalls: run?.api_calls ?? null,
    runDate: run ? formatDateShort(run.finished_at ?? run.started_at) : null,
    runSpan,
    runChecked: run?.products_checked ?? null,
    runErrors: run?.errors ?? null,
    runOk: run?.status === "ok",
    llmCalls: stats.llm_calls,
    llmCost: formatMoney(stats.llm_cost_usd) ?? "$0.00",
    states: stats.snapshots,
    published: stats.changes_published,
    priceUp: stats.price_increase_count,
    priceDown: stats.price_decrease_count,
    shrinks: stats.shrink_count,
    grows: stats.grow_count,
    shrinkPriceCuts: Math.max(
      0,
      stats.changes_published - stats.price_increase_count - stats.price_decrease_count - stats.shrink_count - stats.grow_count,
    ),
  };

  const lede: Run[] = [
    `A scheduled job records the listed package size and regular shelf price of ${formatInt(counts.products)} grocery products at ${stats.location_label}`,
    { fn: 1 },
    " through Kroger’s public product API. It reads each size from the listing text, divides price by size to get a price per unit, and stores a new record only when the size, price or product name changes.",
  ];

  // The size note shows how an edit to the wording moves the reading, from a case where only
  // the wording changed.
  const example = [...shrinks, ...grows].find(
    (c) => (c.noteKind === "pack" || c.noteKind === "each") && c.readBefore && c.readAfter,
  );
  const sizeNote = `Sizes come from the size text in Kroger’s product API; no package was measured.${
    example
      ? ` An edit to the text changes the reading: ${quoted(example.before)} was read as ${example.readBefore} and ${quoted(example.after)} as ${example.readAfter}.`
      : ""
  }`;

  return {
    counts,
    kicker: "Grocery prices",
    headline: headlineFor(counts),
    dek: dekFor(counts, priceMoves, prose),
    lede,
    freshness: freshnessFor(stats, changes, now),
    period,
    source: `Source: Kroger public product API, ${stats.location_label}${period ? `, ${period}` : ""}.`,
    steps,
    annotations: { up: upA, down: downA },
    offScale,
    shrinks,
    grows,
    sizeNote,
    method,
  };
}

// The plain text of a run list, for tests and for places that need a string.
export function runsText(runs: Run[]): string {
  return runs
    .map((run) => {
      if (typeof run === "string") return run;
      if ("b" in run) return run.b;
      if ("text" in run) return run.text;
      if ("fn" in run) return "";
      if ("pick" in run) return "Select a dot";
      return "";
    })
    .join("");
}
