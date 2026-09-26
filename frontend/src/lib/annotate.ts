// Placement of the text on the beeswarm: the two annotations for the largest moves, the axis
// captions, and the tick labels. Pure functions over a text measure, so they can be tested
// without a browser. Every box is kept inside [0, width] of the stage.

import { balancedWrap } from "./text";

export type Measure = (text: string, bold?: boolean) => number;

export interface AnnotationInput {
  id: string;
  label: string;
  // How many words at the start of the label are the brand, kept when a long label is shortened.
  lead?: number;
  price: string;
  percent: string;
  // The dot the label points at.
  x: number;
  y: number;
  // Which side of the dot the text prefers: "start" reads to the right of it, "end" to the left.
  prefer: "start" | "end";
}

export interface AnnotationRow {
  text: string;
  bold: boolean;
}

// A rectangle already taken on the stage, such as the off-scale label.
export interface Box {
  x0: number;
  x1: number;
  top: number;
  bottom: number;
}

export interface PlacedAnnotation extends Box {
  id: string;
  x: number;
  y: number;
  anchor: "start" | "end";
  textX: number;
  // Baseline of the last row; earlier rows sit one row height above each other.
  base: number;
  // Height of the short horizontal leader that joins the dot's line to the text.
  leaderY: number;
  rows: AnnotationRow[];
}

export interface AnnotationOptions {
  width: number;
  narrow: boolean;
  // Baseline of the last row when the label is not lifted.
  base: number;
  rowH: number;
  // Distance between the dot's leader line and the text.
  gap: number;
  // Longest line a name may take before it wraps.
  maxWidth: number;
  // Height of the text above its baseline and below it.
  ascent: number;
  descent: number;
  // Distance from the last baseline down to the horizontal leader.
  leaderGap: number;
}

const CLEARANCE = 12;
const LIFT_GAP = 6;
// A name takes at most this many rows; the dot's tooltip has the full name.
export const NAME_ROWS = 2;
// A shortened name never picks up again on one of these words.
const JOINING = new Set(["a", "an", "and", "&", "as", "at", "for", "in", "of", "on", "or", "the", "to", "with", "+"]);

// A name that would wrap to more than NAME_ROWS rows keeps its brand words and as many of its
// last words as fit, joined by an ellipsis: "Kodiak … Thick and Fluffy Power Waffles".
export function nameRows(label: string, lead: number, maxWidth: number, measure: (text: string) => number): string[] {
  const full = balancedWrap(label, maxWidth, measure);
  if (full.length <= NAME_ROWS) return full;
  const words = label.split(" ").filter(Boolean);
  const head = words.slice(0, lead).join(" ");
  for (let from = lead + 1; from < words.length; from += 1) {
    if (JOINING.has(words[from]!.toLowerCase())) continue;
    const rows = balancedWrap(`${head} … ${words.slice(from).join(" ")}`, maxWidth, measure);
    if (rows.length <= NAME_ROWS) return rows;
  }
  return full;
}

// The rows of one annotation: the name wrapped to the width, then the numbers (on two rows on
// narrow stages, where "$6.49 to $7.99, +23.1% per oz" would not fit beside the dot).
export function annotationRows(
  input: Pick<AnnotationInput, "label" | "price" | "percent" | "lead">,
  narrow: boolean,
  maxWidth: number,
  measure: Measure,
): AnnotationRow[] {
  const name = nameRows(input.label, input.lead ?? 1, maxWidth, (text) => measure(text, true)).map((text) => ({ text, bold: true }));
  const numbers = narrow
    ? [input.price, input.percent].filter(Boolean)
    : [input.price ? `${input.price}, ${input.percent}` : input.percent];
  return [...name, ...numbers.map((text) => ({ text, bold: false }))];
}

// Places each label beside its dot, on the preferred side when that side is inside the stage
// and clear of earlier labels and obstacles, else on the other side. A label that still
// collides is lifted above whatever it hits, so labels never overlap and never leave
// [0, width].
export function placeAnnotations(inputs: AnnotationInput[], options: AnnotationOptions, measure: Measure, obstacles: Box[] = []): PlacedAnnotation[] {
  const { width, base, rowH, gap, ascent, descent, leaderGap } = options;
  const placed: PlacedAnnotation[] = [];
  const blockAt = (rows: number, baseline: number) => ({ top: baseline - (rows - 1) * rowH - ascent, bottom: baseline + descent });
  const hits = (x0: number, x1: number, top: number, bottom: number) =>
    [...obstacles, ...placed].filter(
      (other) => x0 < other.x1 + CLEARANCE && x1 > other.x0 - CLEARANCE && top < other.bottom + 4 && bottom > other.top - 4,
    );

  for (const input of inputs) {
    const rows = annotationRows(input, options.narrow, options.maxWidth, measure);
    const w = Math.min(width, Math.max(...rows.map((row) => measure(row.text, row.bold))));
    const boxFor = (anchor: "start" | "end") => {
      const x0 = anchor === "start" ? input.x + gap : input.x - gap - w;
      return { anchor, x0, x1: x0 + w };
    };
    const sides = (input.prefer === "start" ? ["start", "end"] : ["end", "start"]).map((side) => boxFor(side as "start" | "end"));
    const inside = sides.filter((b) => b.x0 >= 0 && b.x1 <= width);
    const first = blockAt(rows.length, base);
    let box = inside.find((b) => hits(b.x0, b.x1, first.top, first.bottom).length === 0) ?? inside[0];
    if (!box) {
      // Neither side fits: slide the preferred box back inside the stage.
      const x0 = Math.max(0, Math.min(width - w, sides[0]!.x0));
      box = { anchor: sides[0]!.anchor, x0, x1: x0 + w };
    }
    let baseline = base;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const block = blockAt(rows.length, baseline);
      const hit = hits(box.x0, box.x1, block.top, block.bottom);
      if (hit.length === 0) break;
      baseline = Math.min(...hit.map((other) => other.top)) - LIFT_GAP - descent - leaderGap;
    }
    const block = blockAt(rows.length, baseline);
    placed.push({
      id: input.id,
      x: input.x,
      y: input.y,
      anchor: box.anchor,
      textX: box.anchor === "start" ? box.x0 : box.x1,
      base: baseline,
      leaderY: baseline + leaderGap,
      rows,
      x0: box.x0,
      x1: box.x1,
      top: block.top,
      bottom: Math.max(block.bottom, baseline + leaderGap),
    });
  }
  return placed;
}

export interface Caption {
  text: string;
  x: number;
  anchor: "start" | "end";
}

export const CAPTIONS = {
  long: ["← Price per unit fell", "Price per unit rose →"],
  short: ["← Fell", "Rose →"],
} as const;

// The two axis captions sit either side of the zero line. When the long pair would leave the
// stage the short pair is used (the chart title already says "price per unit"); if even that
// does not fit, the captions slide inside.
export function placeCaptions(zeroX: number, width: number, measure: Measure, gap = 10): [Caption, Caption] {
  for (const [left, right] of [CAPTIONS.long, CAPTIONS.short]) {
    const lw = measure(left);
    const rw = measure(right);
    if (zeroX - gap - lw >= 0 && zeroX + gap + rw <= width) {
      return [
        { text: left, x: zeroX - gap, anchor: "end" },
        { text: right, x: zeroX + gap, anchor: "start" },
      ];
    }
  }
  const [left, right] = CAPTIONS.short;
  return [
    { text: left, x: Math.max(measure(left), zeroX - gap), anchor: "end" },
    { text: right, x: Math.min(width - measure(right), zeroX + gap), anchor: "start" },
  ];
}

// A centered tick label that would cross an edge of the stage is anchored to that edge.
export function tickAnchor(x: number, text: string, width: number, measure: Measure): { x: number; anchor: "start" | "middle" | "end" } {
  const w = measure(text);
  if (x - w / 2 < 0) return { x: Math.max(0, x - w / 2), anchor: "start" };
  if (x + w / 2 > width) return { x: Math.min(width, x + w / 2), anchor: "end" };
  return { x, anchor: "middle" };
}
