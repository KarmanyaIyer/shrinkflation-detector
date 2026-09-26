// Everything drawn on the beeswarm step, placed from measured text: the swarm, the axis and its
// tick labels, the two captions, the two annotations, and the off-scale label. Pure, so tests
// can check that nothing leaves [0, width] of the stage.

import { placeAnnotations, placeCaptions, tickAnchor, type AnnotationRow, type Box, type Measure, type PlacedAnnotation } from "./annotate";
import { formatPercent } from "./format";
import { layoutSwarm, type SwarmDot, type SwarmLayout } from "./swarm";
import { balancedWrap } from "./text";

// Width of `text` set in Public Sans at `px` and `weight`.
export type TextMeasure = (text: string, px: number, weight: number) => number;

// Font sizes of the SVG text, in px. global.css sets the same sizes on .t-ann, .t-tick, and
// .t-axl (and their .g-stage.narrow variants); keep the two in step.
export const CHART_FONTS = {
  wide: { ann: 13, tick: 12, caption: 13 },
  narrow: { ann: 12, tick: 11, caption: 12 },
} as const;

export interface ChartLabel {
  id: string;
  label: string;
  lead?: number;
  price: string;
  percent: string;
}

export interface ChartText {
  text: string;
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
}

export interface OffLabel {
  rows: AnnotationRow[];
  x: number;
  base: number;
  anchor: "start" | "end";
}

export interface SwarmChartInput {
  dots: SwarmDot[];
  width: number;
  height: number;
  narrow: boolean;
  // A short stage (a phone, or the band at the top of a tablet): the swarm sits right under the
  // labels instead of in the middle, so the dots can be larger.
  compact: boolean;
  down: ChartLabel | null;
  up: ChartLabel | null;
  offCount: number;
  // What the off-scale dots are, such as "listed size went down".
  offText: string;
}

export interface SwarmChart {
  swarm: SwarmLayout;
  rowH: number;
  axisY: number;
  zeroTop: number;
  ticks: ChartText[];
  offTicks: ChartText[];
  captions: ChartText[];
  annotations: PlacedAnnotation[];
  offLabel: OffLabel | null;
}

const TOP_MARGIN = 4;

export function layoutSwarmChart(input: SwarmChartInput, measureText: TextMeasure): SwarmChart {
  const { width, height, narrow, compact } = input;
  const fonts = narrow ? CHART_FONTS.narrow : CHART_FONTS.wide;
  const annMeasure: Measure = (text, bold) => measureText(text, fonts.ann, bold ? 700 : 400);
  const tickMeasure: Measure = (text) => measureText(text, fonts.tick, 400);
  const captionMeasure: Measure = (text) => measureText(text, fonts.caption, 600);
  const rowH = narrow ? 14 : 16;
  const ascent = Math.round(fonts.ann * 0.74);
  const descent = Math.round(fonts.ann * 0.22);
  const space = narrow
    ? { labelAbove: 14, leader: 6, gap: 4, zero: 8, axis: 12, tick: 16, caption: 34 }
    : { labelAbove: 24, leader: 9, gap: 6, zero: 14, axis: compact ? 18 : 26, tick: 19, caption: compact ? 40 : 46 };
  const bottom = space.axis + space.caption + Math.round(fonts.caption * 0.3) + TOP_MARGIN;
  const maxWidth = narrow ? Math.min(170, Math.floor(width * 0.48)) : Math.min(260, Math.floor(width * 0.38));

  const place = (top: number | undefined) => {
    const swarm = layoutSwarm(input.dots, { width, height, narrow, top, bottom: top === undefined ? undefined : bottom });
    const offLabel = offLabelFor(swarm, input, annMeasure, rowH, narrow);
    const obstacles: Box[] = offLabel ? [offLabel.box] : [];
    const annotations = placeAnnotations(
      [input.down, input.up]
        .map((a, i) => {
          const p = a ? swarm.positions.get(a.id) : undefined;
          return a && p ? { ...a, x: p.x, y: p.y, prefer: i === 0 ? ("start" as const) : ("end" as const) } : null;
        })
        .filter((a): a is NonNullable<typeof a> => a !== null),
      { width, narrow, base: swarm.minY - space.labelAbove, rowH, gap: space.gap, maxWidth, ascent, descent, leaderGap: space.leader },
      annMeasure,
      obstacles,
    );
    const highest = Math.min(swarm.minY - space.zero, ...annotations.map((a) => a.top), offLabel?.box.top ?? Infinity);
    return { swarm, annotations, offLabel, highest };
  };

  // On a compact stage the swarm starts just low enough for the labels above it to clear the
  // stage top. The labels' height does not depend on the dot size, so two or three passes settle.
  let result = place(undefined);
  if (compact) {
    let top = 60;
    for (let pass = 0; pass < 4; pass += 1) {
      result = place(top);
      const shift = TOP_MARGIN - result.highest;
      if (Math.abs(shift) < 1) break;
      top = Math.max(space.zero + TOP_MARGIN, top + shift);
    }
    // Share any height the swarm did not need between the space above and below the chart.
    const axisBottom = result.swarm.maxY + bottom;
    const spare = Math.floor((height - axisBottom) / 2);
    if (spare > 6) result = place(Math.round(result.swarm.minY + spare));
  }

  const { swarm, annotations, offLabel } = result;
  const axisY = Math.round(swarm.maxY + space.axis);
  const tickY = axisY + space.tick;
  const tickText = (v: number) => (v === 0 ? "0" : formatPercent(v, 0)!);
  const ticks = swarm.ticks.map((v) => {
    const at = tickAnchor(swarm.sx(v), tickText(v), width, tickMeasure);
    return { text: tickText(v), x: at.x, y: tickY, anchor: at.anchor };
  });
  const offTicks = [swarm.left, swarm.right]
    .flatMap((zone) => zone?.columns ?? [])
    .map((column) => {
      const text = formatPercent(column.value, 0)!;
      const at = tickAnchor(column.x, text, width, tickMeasure);
      return { text, x: at.x, y: tickY, anchor: at.anchor };
    });
  separateTicks([...ticks, ...offTicks], tickMeasure);
  const shown = (t: ChartText) => t.text !== "";
  const captions = placeCaptions(swarm.sx(0), width, captionMeasure).map((c) => ({ ...c, y: axisY + space.caption }));

  return {
    swarm,
    rowH,
    axisY,
    zeroTop: swarm.minY - space.zero,
    ticks: ticks.filter(shown),
    offTicks: offTicks.filter(shown),
    captions,
    annotations,
    offLabel: offLabel ? { rows: offLabel.rows, x: offLabel.x, base: offLabel.base, anchor: offLabel.anchor } : null,
  };
}

// Tick labels that would touch their neighbour are anchored away from each other: the left one
// ends at its tick and the right one starts at its tick. If that is still not enough room, the
// left one is dropped (it is an in-scale end tick next to an off-scale column).
function separateTicks(labels: ChartText[], measure: Measure): void {
  const boxOf = (t: ChartText) => {
    const w = measure(t.text);
    const x0 = t.anchor === "start" ? t.x : t.anchor === "end" ? t.x - w : t.x - w / 2;
    return { x0, x1: x0 + w };
  };
  const sorted = [...labels].sort((a, b) => a.x - b.x);
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const left = sorted[i]!;
    const right = sorted[i + 1]!;
    if (boxOf(left).x1 + 6 <= boxOf(right).x0) continue;
    if (left.anchor === "middle") left.anchor = "end";
    if (right.anchor === "middle") right.anchor = "start";
    if (boxOf(left).x1 + 6 > boxOf(right).x0) left.text = "";
  }
}

// "3 off the scale" and what they are, set above the off-scale dots and kept inside the off-scale
// zone plus its break gap, so it never crosses the leader of an in-scale annotation.
function offLabelFor(
  swarm: SwarmLayout,
  input: SwarmChartInput,
  measure: Measure,
  rowH: number,
  narrow: boolean,
): (OffLabel & { box: Box }) | null {
  const zone = swarm.right ?? swarm.left;
  if (!zone || input.offCount === 0) return null;
  const isRight = zone === swarm.right;
  const x = isRight ? zone.x1 : zone.x0;
  const maxWidth = isRight ? zone.x1 - (swarm.x1 + 6) : swarm.x0 - 6 - zone.x0;
  const rows: AnnotationRow[] = [
    ...balancedWrap(`${input.offCount} off the scale`, maxWidth, (t) => measure(t, true)).map((text) => ({ text, bold: true })),
    ...balancedWrap(input.offText, maxWidth, (t) => measure(t, false)).map((text) => ({ text, bold: false })),
  ];
  const w = Math.max(...rows.map((row) => measure(row.text, row.bold)));
  let columnTop = Infinity;
  for (const column of zone.columns) {
    for (const id of column.ids) columnTop = Math.min(columnTop, (swarm.positions.get(id)?.y ?? swarm.cy) - swarm.r);
  }
  const base = Math.round(columnTop - (narrow ? 8 : 12));
  const ascent = rowH * 0.7;
  const box: Box = {
    x0: isRight ? x - w : x,
    x1: isRight ? x : x + w,
    top: base - (rows.length - 1) * rowH - ascent,
    bottom: base + 4,
  };
  return { rows, x, base, anchor: isRight ? "end" : "start", box };
}
