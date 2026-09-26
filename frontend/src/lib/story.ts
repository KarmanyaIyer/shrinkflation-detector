// Every sentence on the article page that depends on the data is written here from the API
// responses, so the copy can be unit tested against the current data and against edge cases
// (nothing changed yet, no size changes, a tie for the largest move, a failed run).
//
// Counting rules: price moves are counted as events ("38 prices rose"); everything drawn as a
// dot is counted per product, by the product's newest change, so the words match the graphic
// when one product changed more than once. Size cards and size counts use each product's
// newest size change.
//
// Prose spells units out ("per ounce"); chart labels, tables, and size strings keep the
// abbreviations ("per oz").

import type { CategoryCount, ChangeOut, Stats } from "../api/types";
import { latestByProduct, unitChangePct } from "./changes";
import {
  capitalize,
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
  unitProse,
  unitWord,
} from "./format";
import { direction, SIZE_KINDS } from "./kinds";
import { isOffScale } from "./swarm";
import { displayName, joinProse, leadWords, proseName } from "./text";

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
  // chart wraps and shortens past two rows.
  label: string;
  // How many words at the start of `label` are the brand.
  lead: number;
  value: number;
  line: string;
  // The price part and the percent part of `line`, for layouts that put them on two rows.
  price: string;
  percent: string;
  // `line` with the unit spelled out, for the text equivalent.
  spoken: string;
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

type Namer = (change: ChangeOut) => string;

function annotation(change: ChangeOut, prose: Namer): Annotation {
  const value = unitChangePct(change) ?? 0;
  const name = change.product.description;
  const unit = unitOf(change);
  const price = priceLine(change);
  const percent = `${formatPercent(value)}${unit ? ` per ${unitWord(unit)}` : ""}`;
  const label = prose(change);
  return {
    id: change.product.id,
    name,
    label,
    lead: leadWords(label, change.product.brand),
    value,
    price,
    percent,
    line: price ? `${price}, ${percent}` : percent,
    spoken: [price, `${formatPercent(value)} per ${unitProse(unit)}`].filter(Boolean).join(", "),
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
  } else if (sizePct !== null && Math.abs(sizePct) >= 50 && samePrice) {
    // The card already shows both sizes and the unchanged price, so a large move adds no clue.
    noteKind = "half";
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

// "Over 16 days at one Kroger, 38 prices rose, 36 fell and four listed sizes changed." The
// size clause counts products by their newest size change and never says a package shrank.
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
  const sizes = counts.shrinks + counts.grows;
  if (counts.shrinks && counts.grows) parts.push(`${numberWord(sizes)} listed sizes changed`);
  else if (counts.shrinks) parts.push(`${countNoun(counts.shrinks, "listed size")} went down`);
  else if (counts.grows) parts.push(`${countNoun(counts.grows, "listed size")} went up`);
  if (parts.length === 0) return `${span}, no listed size or shelf price changed.`;
  if (!counts.priceUp && !counts.priceDown) parts.unshift("no shelf price moved");
  return `${span}, ${joinProse(parts)}.`;
}

// "Of the 74 price moves, 57 were under 10% per unit", with the none, both, and all cases.
function under10Sentence(moves: number, under: number): string {
  if (under === 0) {
    return moves === 2 ? "Neither price move was under 10% per unit." : `None of the ${numberWord(moves)} price moves was under 10% per unit.`;
  }
  if (under === moves) {
    return moves === 2 ? "Both price moves were under 10% per unit." : `All ${numberWord(moves)} price moves were under 10% per unit.`;
  }
  return `Of the ${numberWord(moves)} price moves, ${numberWord(under)} ${under === 1 ? "was" : "were"} under 10% per unit.`;
}

// "Reese's Puffs went from $5.49 to $3.99, 27.3% less per ounce." The shelf prices come right
// after the name, so they cannot be read as prices per unit.
function largestMove(change: ChangeOut, prose: Namer): Run[] {
  const pct = unitChangePct(change) ?? 0;
  const pb = priceBefore(change);
  const pa = priceAfter(change);
  const unit = unitOf(change);
  const prices = pb && pa && pb !== pa ? ` went from ${pb} to ${pa},` : "";
  const per = toNumber(change.unit_price_change_pct) !== null && unit ? ` per ${unitProse(unit)}` : "";
  return [
    { product: change.product.id, text: prose(change) },
    `${prices || " moved"} ${percentWord(pct)} ${pct > 0 ? "more" : "less"}${per}.`,
  ];
}

function dekFor(counts: StoryCounts, priceMoves: ChangeOut[], sizeChanges: ChangeOut[], stats: Stats, prose: Namer): Run[] {
  if (priceMoves.length === 0) {
    if (sizeChanges.length === 0) {
      const first = formatDate(stats.tracking_since);
      return [first ? `The first check ran ${first}.` : "No check has run yet."];
    }
    // The headline already gives the count, so the dek dates the size changes.
    const days = sizeChanges.map((c) => c.after_seen_at ?? c.detected_at).sort();
    const first = formatDateShort(days[0]);
    const last = formatDateShort(days[days.length - 1]);
    if (sizeChanges.length === 1) return [`It was seen ${last}.`];
    if (first === last) return [`${capitalize(every(sizeChanges.length))} were seen ${last}.`];
    return [`The first was seen ${first} and the latest ${last}.`];
  }
  const largest = Math.max(...priceMoves.map((change) => Math.abs(unitChangePct(change) ?? 0)));
  const winners = priceMoves.filter((change) => Math.abs(unitChangePct(change) ?? 0) === largest);
  if (priceMoves.length === 1) return ["One shelf price moved: ", ...largestMove(priceMoves[0]!, prose)];
  const lead = under10Sentence(priceMoves.length, counts.under10);
  if (winners.length === 1) return [`${lead} The largest: `, ...largestMove(winners[0]!, prose)];
  // Ties are on magnitude, so the sign is only shown when every tied move points the same way.
  const ups = winners.filter((change) => (unitChangePct(change) ?? 0) > 0).length;
  const downs = winners.length - ups;
  const shared = `was shared by ${countNoun(winners.length, "product")}`;
  if (ups && downs) {
    return [`${lead} The largest move, ${percentWord(largest)} per unit, ${shared}, ${numberWord(ups)} up and ${numberWord(downs)} down.`];
  }
  return [`${lead} The largest move, ${formatPercent(unitChangePct(winners[0]!))} per unit, ${shared}.`];
}

// A one-line freshness note under the byline, from the last finished check. run.changes_found
// counts every change the check classified, including ones held for review or hidden as noise,
// so the line says how many of them were published.
function freshnessFor(stats: Stats, changes: ChangeOut[], now: Date): string {
  const run = stats.last_run;
  if (!run) return "No check has run yet.";
  const at = run.finished_at ?? run.started_at;
  const when = `${formatDateShort(at) ?? ""} at ${formatTime(at) ?? ""} Eastern`;
  if (now.getTime() - new Date(at).getTime() > HOURS_36) return `Data last updated ${when}.`;
  if (run.status !== "ok") {
    // A check with errors skips the batches that failed and carries on.
    return run.products_checked < stats.products_tracked
      ? `Last check ${when} covered ${formatInt(run.products_checked)} of ${formatInt(stats.products_tracked)} products.`
      : `Last check ${when} ended with ${countNoun(Math.max(1, run.errors), "error")}.`;
  }
  const start = new Date(run.started_at).getTime();
  const end = new Date(at).getTime();
  const published = changes.filter((change) => {
    const t = new Date(change.detected_at).getTime();
    return t >= start && t <= end;
  }).length;
  const found = run.changes_found;
  if (found === 0) return `Last checked ${when}: no size or price changes.`;
  if (published >= found) return `Last checked ${when}: ${countNoun(published, "size or price change")}.`;
  if (published === 0) return `Last checked ${when}: ${countNoun(found, "change")} flagged, ${found === 1 ? "not" : "none"} published.`;
  return `Last checked ${when}: ${countNoun(found, "change")} flagged, ${numberWord(published)} published.`;
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
  const price = c.samePrice || !c.priceBefore ? (c.priceAfter ?? "no price") : `${c.priceBefore} to ${c.priceAfter ?? "no price"}`;
  return `${displayName(c.name)}: ${quoted(c.before)} to ${quoted(c.after)} at ${price}, price per ${unitProse(c.unit)} ${
    formatPercent(c.unitPct) ?? "unchanged"
  }, ${c.when}.`;
}

// "all three", "both", "it": every item of a group of `n`.
function every(n: number): string {
  return n === 1 ? "it" : n === 2 ? "both" : `all ${numberWord(n)}`;
}

// The legend sentence of the changed step: which way the price per unit went, by product.
function colorSentence(up: number, down: number, sizeDots: number): Run[] {
  if (!up && !down) return [];
  const counting = sizeDots
    ? `, counting the ${sizeDots === 1 ? "one listed size change" : `${numberWord(sizeDots)} listed size changes`}`
    : "";
  const lead = `Color shows which way the price per unit went${counting}: `;
  const all = (n: number) => (n === 1 ? "." : n === 2 ? " for both." : ` for all ${numberWord(n)}.`);
  if (up && down) return [lead, { dot: "more" }, `up for ${numberWord(up)}, `, { dot: "less" }, `down for ${numberWord(down)}.`];
  if (up) return [lead, { dot: "more" }, `up${all(up)}`];
  return [lead, { dot: "less" }, `down${all(down)}`];
}

// The swarm step's text: the typical price move. The changed step has already said how many
// dots are listed size changes, so this only names them when there is no price move at all.
function swarmText(priceMoves: ChangeOut[], sizeDots: number): Run[] {
  const values = priceMoves.map((change) => unitChangePct(change) ?? 0).sort((a, b) => a - b);
  if (values.length >= 3) return [{ b: `The median price move, up or down, was ${percentWord(median(values.map(Math.abs))!)} per unit.` }];
  if (values.length === 2) return [{ b: `The two price moves were ${formatPercent(values[0])} and ${formatPercent(values[1])} per unit.` }];
  if (values.length === 1) return [{ b: `The one price move was ${formatPercent(values[0])} per unit.` }];
  if (sizeDots === 1) return [{ b: "The one dot is a listed size change." }];
  if (sizeDots === 2) return [{ b: "Both dots are listed size changes." }];
  if (sizeDots) return [{ b: `All ${numberWord(sizeDots)} dots are listed size changes.` }];
  return [{ b: "No change has been recorded yet, so the chart is empty." }];
}

export function buildStory(input: StoryInput): Story {
  const { stats, changes, categories, now } = input;
  const latest = latestByProduct(changes);
  const latestList = [...latest.values()];
  const priceMoves = changes.filter((change) => !SIZE_KINDS.has(change.kind));
  // Each product's newest size change decides whether it has a card and in which group, so a
  // listing that went down and later back up shows once, as it is now.
  const sizeChanges = [...latestByProduct(changes.filter((c) => SIZE_KINDS.has(c.kind))).values()];
  const shrinkChanges = sizeChanges.filter((c) => c.kind === "shrink" || c.kind === "shrink_price_cut");
  const growChanges = sizeChanges.filter((c) => c.kind === "grow");
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
  const sizeDots = latestList.filter((change) => SIZE_KINDS.has(change.kind)).length;

  const sortedCats = [...categories].sort((a, b) => b.products - a.products || a.category.localeCompare(b.category));
  const largest = sortedCats[0];

  const steps: StoryStep[] = [];

  // 1. Every product by category.
  const gridText: Run[] = ["Each dot is one product, grouped by category."];
  if (largest && sortedCats.length > 1) {
    const top = sortedCats.filter((c) => c.products === largest.products);
    gridText.push(
      top.length === 1
        ? ` ${largest.category} is the largest group, with ${numberWord(largest.products)} ${largest.products === 1 ? "item" : "items"}.`
        : top.length < sortedCats.length
          ? ` ${joinProse(top.map((c) => c.category))} are the largest groups, with ${numberWord(largest.products)} ${largest.products === 1 ? "item" : "items"} each.`
          : "",
    );
  }
  steps.push({
    kind: "grid",
    title: `${formatInt(counts.products)} products, by category`,
    paragraphs: [gridText.filter(Boolean)],
    alt: `${counts.products === 1 ? "One dot" : `${formatInt(counts.products)} dots`} in ${countNoun(sortedCats.length, "category", "categories")}: ${sortedCats
      .map((c) => `${c.category} ${formatInt(c.products)}`)
      .join(", ")}.`,
  });

  // 2. The changed ones light up. Small moves and unclear readings are recorded but not
  // published, so the definition names the rules in the method box.
  const definition: Run[] = [
    "A change means a morning check found a different size or price than the check before it, and the difference passed the ",
    { link: "#how", text: "publishing rules" },
    ".",
  ];
  const changedText: Run[][] =
    counts.changed === 0
      ? [[...definition, " No check has found one yet."]]
      : [[...definition, " That happened to ", { b: countNoun(counts.changed, "product") }, "."], colorSentence(counts.up, counts.down, sizeDots)];
  const withChanges = sortedCats.filter((c) => c.changes > 0);
  steps.push({
    kind: "changed",
    title: "Products with a recorded change",
    paragraphs: changedText.filter((paragraph) => paragraph.length > 0),
    alt:
      counts.changed === 0
        ? "No product is highlighted: nothing has changed yet."
        : `${counts.changed === 1 ? "The one changed product highlighted in its category row" : `The ${formatInt(counts.changed)} changed products highlighted in their category rows`}: ${withChanges
            .map((c) => `${c.category} ${c.changes}`)
            .join(", ")}.`,
  });

  // 3. Beeswarm of unit price change.
  const upA = up ? annotation(up, prose) : null;
  const downA = down ? annotation(down, prose) : null;
  const swarmAlt = [
    counts.changed ? "Each changed product placed by its change in price per unit." : "No product has a change to place.",
    upA ? `Largest increase on the axis: ${displayName(upA.name)}, ${upA.spoken}.` : "",
    downA ? `Largest decrease on the axis: ${displayName(downA.name)}, ${downA.spoken}.` : "",
    offScale.length ? `Off the scale: ${offScale.map((a) => `${displayName(a.name)}, ${a.spoken}`).join("; ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  steps.push({
    kind: "swarm",
    title: counts.changed ? `Change in price per unit, ${countNoun(counts.changed, "product")}` : "Change in price per unit",
    paragraphs: [swarmText(priceMoves, sizeDots)],
    alt: swarmAlt,
  });

  // 4. Size decreases, with their listed sizes. Each card's note says what its texts show.
  if (shrinks.length) {
    const n = shrinks.length;
    const same = shrinks.filter((c) => c.samePrice).length;
    const samePrice =
      same === n
        ? n === 1
          ? ", at the same shelf price."
          : `, and ${every(n)} kept the same shelf price.`
        : same
          ? `; ${numberWord(same)} of them kept the same shelf price.`
          : ".";
    steps.push({
      kind: "shrinks",
      title: "Listed size went down",
      paragraphs: [
        [{ b: `The listed size went down on ${countNoun(n, "product")}` }, samePrice],
        ["The detector reads the size Kroger lists, so a corrected listing and a smaller package look the same.", { fn: 2 }],
      ],
      alt: shrinks.map(caseAlt).join(" "),
    });
  }

  // 5. Size increases. The card beside the text names the product, so the text leads with the
  // size change itself.
  if (grows.length) {
    const text: Run[] = [{ b: `The listed size went up on ${countNoun(grows.length, "product")}` }];
    if (grows.length === 1) {
      const only = grows[0]!;
      const price = only.samePrice
        ? ` at the same ${only.priceAfter}`
        : only.priceBefore && only.priceAfter
          ? ` as the shelf price went from ${only.priceBefore} to ${only.priceAfter}`
          : "";
      text.push(
        `: ${quoted(only.before)} to ${quoted(only.after)}${price}`,
        only.unitPct !== null && only.unitPct < 0 ? `, so the price per ${unitProse(only.unit)} fell ${percentWord(only.unitPct)}.` : ".",
      );
    } else {
      text.push(`: ${grows.map((c) => `${c.prose}, ${quoted(c.before)} to ${quoted(c.after)}`).join("; ")}.`);
    }
    steps.push({
      kind: "grows",
      title: "Listed size went up",
      paragraphs: [text],
      alt: grows.map(caseAlt).join(" "),
    });
  }

  // 6. Back to the whole record.
  steps.push({
    kind: "end",
    title: `${formatInt(counts.products)} products, by category`,
    paragraphs: [[{ pick: true }, " to open one product’s history, or ", { link: "#ask", text: "ask the data" }, "."]],
    alt: `${counts.products === 1 ? "The one product" : `All ${formatInt(counts.products)} products`} by category again, ${
      counts.changed === 0
        ? "with none in color, since nothing has changed yet"
        : counts.changed === 1
          ? "with the one changed product in color"
          : `with the ${formatInt(counts.changed)} changed ones in color`
    }.`,
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

  // How the reading works is in the method box; the lede says what is tracked and why the
  // graphic uses the price per unit.
  const lede: Run[] = [
    `Every morning, a job checks the listed size and regular shelf price of ${formatInt(counts.products)} grocery products at ${stats.location_label}.`,
    { fn: 1 },
    " Changes are compared in price per unit, which rises when the shelf price goes up or the listed size goes down.",
  ];

  // The size note shows how an edit to the wording moves the reading, from a case where only
  // the wording changed.
  const example = [...shrinks, ...grows].find(
    (c) => (c.noteKind === "pack" || c.noteKind === "each") && c.readBefore && c.readAfter,
  );
  const sizeNote = `No package was measured.${
    example
      ? ` Rewording the listed size changes the reading: ${quoted(example.before)} was read as ${example.readBefore} and ${quoted(example.after)} as ${example.readAfter}.`
      : " Every size comes from Kroger’s product API."
  }`;

  return {
    counts,
    kicker: "Grocery prices",
    headline: headlineFor(counts),
    dek: dekFor(counts, priceMoves, sizeChanges, stats, prose),
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
