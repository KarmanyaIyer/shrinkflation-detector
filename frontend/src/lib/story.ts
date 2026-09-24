// Every sentence on the article page that depends on the data is written here from the API
// responses, so the copy can be unit tested against the current data and against edge cases
// (nothing changed yet, no size changes, a tie for the largest move, a failed run).

import type { CategoryCount, ChangeOut, Stats } from "../api/types";
import {
  countNoun,
  daysBetween,
  formatDate,
  formatDateShort,
  formatInt,
  formatMoney,
  formatPercent,
  formatSpan,
  formatTime,
  numberWord,
  pluralize,
  quoted,
  toNumber,
  unitWord,
} from "./format";
import { direction, SIZE_KINDS } from "./kinds";
import { isOffScale } from "./swarm";
import { displayName, joinProse, shortName } from "./text";

export interface StoryInput {
  stats: Stats;
  changes: ChangeOut[];
  categories: CategoryCount[];
  now: Date;
}

export type StepKind = "grid" | "changed" | "swarm" | "shrinks" | "grows" | "end";

// A step's paragraphs are built from runs so the component can set bold text, color dots,
// footnote markers, and the pointer-dependent verb without the copy module knowing about JSX.
export type Run =
  | string
  | { b: string }
  | { dot: "more" | "less" }
  | { fn: number }
  | { link: string; text: string }
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
  short: string;
  kind: string;
  before: string;
  after: string;
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
  // What the two label texts show, written from the texts themselves.
  note: string;
  noteKind: "pack" | "each" | "half" | "plain";
}

export interface Annotation {
  id: string;
  name: string;
  short: string;
  value: number;
  line: string;
}

export interface StoryCounts {
  products: number;
  categories: number;
  changed: number;
  up: number;
  down: number;
  priceUp: number;
  priceDown: number;
  priceMoves: number;
  under10: number;
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
  dek: string;
  lede: Run[];
  freshness: string;
  period: string;
  source: string;
  steps: StoryStep[];
  annotations: { up: Annotation | null; down: Annotation | null };
  offScale: Annotation[];
  shrinks: SizeCase[];
  grows: SizeCase[];
  method: MethodFacts;
}

const HOURS_36 = 36 * 3_600_000;

function pct(change: ChangeOut): number | null {
  return toNumber(change.unit_price_change_pct) ?? toNumber(change.price_change_pct);
}

function priceLine(change: ChangeOut): string {
  const before = formatMoney(change.before?.price_regular);
  const after = formatMoney(change.after?.price_regular);
  if (before && after && before !== after) return `${before} to ${after}`;
  return after ?? before ?? "";
}

function annotation(change: ChangeOut): Annotation {
  const value = pct(change) ?? 0;
  const name = change.product.description;
  const unit = change.after?.unit_price?.unit ?? change.before?.unit_price?.unit;
  const price = priceLine(change);
  return {
    id: change.product.id,
    name,
    short: shortName(name),
    value,
    line: `${price ? `${price}, ` : ""}${formatPercent(value)}${unit ? ` per ${unitWord(unit)}` : ""}`,
  };
}

const PACK = /\b\d+\s*(pk|pack|packs|ct|count)\b\s*\//i;
const EACH = /\beach\b/i;

export function sizeCase(change: ChangeOut): SizeCase {
  const before = change.before;
  const after = change.after;
  const beforeText = before?.size_text ?? "";
  const afterText = after?.size_text ?? "";
  const priceBefore = formatMoney(before?.price_regular);
  const priceAfter = formatMoney(after?.price_regular);
  const samePrice = priceBefore !== null && priceBefore === priceAfter;
  const unitPct = toNumber(change.unit_price_change_pct);
  const unit = after?.unit_price?.unit ?? before?.unit_price?.unit ?? "";
  const quantityBefore = toNumber(before?.display_quantity);
  const quantityAfter = toNumber(after?.display_quantity);
  const sizePct = toNumber(change.size_change_pct);

  let noteKind: SizeCase["noteKind"] = "plain";
  let note: string;
  if (PACK.test(beforeText) && !PACK.test(afterText)) {
    noteKind = "pack";
    note = "The earlier text had a pack count; the new text does not.";
  } else if (EACH.test(beforeText) && !EACH.test(afterText)) {
    noteKind = "each";
    note = "The earlier text said “each”; the new text does not.";
  } else if (sizePct !== null && sizePct <= -50 && samePrice) {
    noteKind = "half";
    note = `The listed ${unit === "each" ? "count" : "size"} fell by more than half at the same shelf price.`;
  } else if (sizePct !== null && sizePct >= 50 && samePrice) {
    noteKind = "half";
    note = `The listed ${unit === "each" ? "count" : "size"} rose by half or more at the same shelf price.`;
  } else {
    note = samePrice
      ? "Same shelf price on both dates."
      : priceBefore && priceAfter
        ? `Shelf price ${priceBefore} to ${priceAfter}.`
        : "";
  }

  return {
    id: change.product.id,
    name: change.product.description,
    short: shortName(change.product.description),
    kind: change.kind,
    before: beforeText,
    after: afterText,
    priceBefore,
    priceAfter,
    samePrice,
    unitPct,
    unitBefore: before?.unit_price ? `$${Number(before.unit_price.value).toFixed(3)}` : null,
    unitAfter: after?.unit_price ? `$${Number(after.unit_price.value).toFixed(3)}` : null,
    unit,
    quantityBefore,
    quantityAfter,
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
  if (counts.shrinks) parts.push(`the listed size went down on ${numberWord(counts.shrinks)}`);
  else if (counts.grows) parts.push(`the listed size went up on ${numberWord(counts.grows)}`);
  if (parts.length === 0) return `${span}, no listed size or shelf price changed.`;
  if (!counts.priceUp && !counts.priceDown) parts.unshift("no shelf price changed");
  return `${span}, ${joinProse(parts)}.`;
}

function dekFor(counts: StoryCounts, priceMoves: ChangeOut[]): string {
  if (priceMoves.length === 0) {
    const sizes = counts.shrinks + counts.grows;
    if (sizes === 0) return "Neither the listed size nor the regular shelf price of any tracked product changed.";
    return `No regular shelf price changed. The listed size changed on ${countNoun(sizes, "product")}.`;
  }
  const largest = Math.max(...priceMoves.map((change) => Math.abs(pct(change) ?? 0)));
  const winners = priceMoves.filter((change) => Math.abs(pct(change) ?? 0) === largest);
  let lead: string;
  if (priceMoves.length === 1) {
    lead = "One shelf price moved";
  } else {
    const under = counts.under10 === 0 ? "none" : formatInt(counts.under10);
    lead = `Of the ${formatInt(priceMoves.length)} price moves, ${under} ${counts.under10 === 1 ? "was" : "were"} under 10% per unit`;
  }
  let tail: string;
  if (winners.length === 1) {
    const a = annotation(winners[0]!);
    const name = displayName(a.name);
    tail = priceMoves.length === 1 ? `: ${name}, ${a.line}.` : `. The largest was ${name}, ${a.line}.`;
  } else {
    // Ties are on magnitude, so the sign is only shown when every tied move points the same way.
    const signs = new Set(winners.map((change) => Math.sign(pct(change) ?? 0)));
    const value = signs.size === 1 ? formatPercent(pct(winners[0]!)) : `${(formatPercent(largest) ?? "").replace(/^[+−-]/, "")} either way`;
    tail = `. ${countNoun(winners.length, "product").replace(/^./, (c) => c.toUpperCase())} tied for the largest move at ${value} per unit.`;
  }
  return `${lead}${tail}`;
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
    return `The last check, ${when}, ended with ${pluralize(run.errors, "error")} after ${checked}. Figures include everything recorded so far.`;
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
  else found = `That check found ${countNoun(run.changes_found, "size or price change")} and published ${published}.`;
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

export function buildStory(input: StoryInput): Story {
  const { stats, changes, categories, now } = input;
  const priceMoves = changes.filter((change) => !SIZE_KINDS.has(change.kind));
  const shrinkChanges = changes.filter((change) => change.kind === "shrink" || change.kind === "shrink_price_cut");
  const growChanges = changes.filter((change) => change.kind === "grow");
  const { period, last } = periodFor(stats, changes);
  const days = stats.tracking_since && last ? daysBetween(stats.tracking_since, last) : 0;

  const counts: StoryCounts = {
    products: stats.products_tracked,
    categories: stats.categories,
    changed: changes.length,
    up: changes.filter((change) => direction(change) === "more").length,
    down: changes.filter((change) => direction(change) === "less").length,
    priceUp: priceMoves.filter((change) => change.kind === "price_increase").length,
    priceDown: priceMoves.filter((change) => change.kind === "price_decrease").length,
    priceMoves: priceMoves.length,
    under10: priceMoves.filter((change) => Math.abs(pct(change) ?? 0) < 10).length,
    shrinks: shrinkChanges.length,
    grows: growChanges.length,
    states: stats.snapshots,
    days,
  };

  const inScale = changes.filter((change) => pct(change) !== null && !isOffScale(pct(change)!));
  const up = inScale.filter((change) => (pct(change) ?? 0) > 0).sort((a, b) => pct(b)! - pct(a)!)[0] ?? null;
  const down = inScale.filter((change) => (pct(change) ?? 0) < 0).sort((a, b) => pct(a)! - pct(b)!)[0] ?? null;
  const offScale = changes
    .filter((change) => pct(change) !== null && isOffScale(pct(change)!))
    .sort((a, b) => pct(a)! - pct(b)!)
    .map(annotation);

  const shrinks = shrinkChanges.map(sizeCase).sort((a, b) => (b.unitPct ?? 0) - (a.unitPct ?? 0));
  const grows = growChanges.map(sizeCase).sort((a, b) => (a.unitPct ?? 0) - (b.unitPct ?? 0));

  const sortedCats = [...categories].sort((a, b) => b.products - a.products || a.category.localeCompare(b.category));
  const largest = sortedCats[0];
  const smallest = sortedCats[sortedCats.length - 1];

  const steps: StoryStep[] = [];

  // 1. Every product by category.
  const gridText: Run[] = ["Each dot is one product, grouped by category."];
  if (largest && smallest && largest !== smallest) {
    gridText.push(
      ` ${largest.category} is the largest group, with ${formatInt(largest.products)} items. ${smallest.category} is the smallest, with ${formatInt(smallest.products)}.`,
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
      { b: pluralize(counts.changed, "product") },
      ".",
    ]);
    changedText.push([
      "Color shows which way the price per unit went: ",
      { dot: "more" },
      `up for ${formatInt(counts.up)}, `,
      { dot: "less" },
      `down for ${formatInt(counts.down)}.`,
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
      b: `${formatInt(counts.priceUp)} went up and ${formatInt(counts.priceDown)} came down.`,
    });
  } else if (counts.priceUp || counts.priceDown) {
    const n = counts.priceUp || counts.priceDown;
    swarmText.push({
      b:
        n === 1
          ? `The one price move was ${counts.priceUp ? "an increase" : "a cut"}.`
          : `All ${formatInt(n)} price moves were ${counts.priceUp ? "increases" : "cuts"}.`,
    });
  } else {
    swarmText.push({ b: "No shelf price changed." });
  }
  if (counts.priceMoves > 1) {
    swarmText.push(` Of those ${formatInt(counts.priceMoves)} moves, ${formatInt(counts.under10)} ${counts.under10 === 1 ? "was" : "were"} under 10% per unit.`);
  }
  const upA = up ? annotation(up) : null;
  const downA = down ? annotation(down) : null;
  const swarmAlt = [
    `Each changed product placed by its change in price per unit.`,
    upA ? `Largest increase on the axis: ${upA.name}, ${upA.line}.` : "",
    downA ? `Largest decrease on the axis: ${downA.name}, ${downA.line}.` : "",
    offScale.length
      ? `Off the scale: ${offScale.map((a) => `${a.name}, ${a.line}`).join("; ")}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  steps.push({
    kind: "swarm",
    title: `Change in price per unit, ${pluralize(counts.changed, "product")}`,
    paragraphs: [swarmText],
    alt: swarmAlt,
  });

  // 4. Size decreases, with their label texts.
  if (shrinks.length) {
    const same = shrinks.filter((c) => c.samePrice).length;
    const textual = shrinks.filter((c) => c.noteKind === "pack" || c.noteKind === "each").length;
    const first: Run[] = [
      { b: `The listed size went down on ${countNoun(shrinks.length, "product")}` },
      same === shrinks.length
        ? `; the shelf price stayed the same on ${shrinks.length === 1 ? "it" : shrinks.length === 2 ? "both" : `all ${numberWord(shrinks.length)}`}.`
        : same
          ? `; the shelf price stayed the same on ${numberWord(same)} of them.`
          : ".",
    ];
    const second: Run[] = [];
    if (textual) {
      second.push(
        textual === shrinks.length
          ? `On ${shrinks.length === 1 ? "it" : shrinks.length === 2 ? "both" : "each one"} the new text dropped a pack count or the word “each”. `
          : `On ${numberWord(textual)} of them the new text dropped a pack count or the word “each”. `,
      );
    }
    second.push(
      "The detector reads Kroger’s listing text, so a corrected listing and a smaller package look the same.",
      { fn: 1 },
    );
    steps.push({
      kind: "shrinks",
      title: "Listings whose size text went down",
      paragraphs: [first, second],
      alt: shrinks
        .map((c) => `${c.name}: ${quoted(c.before)} to ${quoted(c.after)} at ${c.priceAfter ?? "no price"}, price per ${unitWord(c.unit)} ${formatPercent(c.unitPct) ?? "unchanged"}, ${c.when}.`)
        .join(" "),
    });
  }

  // 5. Size increases.
  if (grows.length) {
    const first = grows[0]!;
    const text: Run[] = [{ b: `The listed size went up on ${countNoun(grows.length, "product")}` }];
    if (grows.length === 1) {
      text.push(
        `: ${displayName(first.name)}, ${quoted(first.before)} to ${quoted(first.after)} at ${first.samePrice ? `the same ${first.priceAfter}` : `${first.priceBefore} to ${first.priceAfter}`}`,
        first.unitPct !== null && first.unitPct < 0
          ? `, so the price per ${unitWord(first.unit)} fell ${formatPercent(Math.abs(first.unitPct))!.slice(1)}.`
          : ".",
      );
    } else {
      text.push(`. ${grows.map((c) => `${displayName(c.name)}, ${quoted(c.before)} to ${quoted(c.after)}`).join("; ")}.`);
    }
    steps.push({
      kind: "grows",
      title: "Listings whose size text went up",
      paragraphs: [text],
      alt: grows
        .map((c) => `${c.name}: ${quoted(c.before)} to ${quoted(c.after)} at ${c.priceAfter ?? "no price"}, price per ${unitWord(c.unit)} ${formatPercent(c.unitPct) ?? "unchanged"}, ${c.when}.`)
        .join(" "),
    });
  }

  // 6. Back to the whole record.
  steps.push({
    kind: "end",
    title: `${formatInt(counts.products)} products, by category`,
    paragraphs: [
      [
        `That is the whole record so far: ${formatInt(counts.states)} stored states across ${formatInt(counts.products)} products. `,
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
    { fn: 2 },
    " through Kroger’s public product API. It reads each size from the listing text, divides price by size to get a price per unit, and stores a new record only when the size, price or product name changes.",
  ];

  return {
    counts,
    kicker: "Grocery prices",
    headline: headlineFor(counts),
    dek: dekFor(counts, priceMoves),
    lede,
    freshness: freshnessFor(stats, changes, now),
    period,
    source: `Source: Kroger public product API, ${stats.location_label}${period ? `, ${period}` : ""}.`,
    steps,
    annotations: { up: upA, down: downA },
    offScale,
    shrinks,
    grows,
    method,
  };
}
