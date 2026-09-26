import { describe, expect, it } from "vitest";
import * as fx from "../api/fixtures";
import { CHART_FONTS, layoutSwarmChart, type ChartText, type SwarmChart, type SwarmChartInput, type TextMeasure } from "./chartLayout";
import { MINUS } from "./format";
import { isOffScale, type SwarmDot } from "./swarm";

// A stand-in for the canvas measure: wider at larger sizes and at semibold or bold weights.
const measureText: TextMeasure = (text, px, weight) => text.length * px * (weight >= 600 ? 0.6 : 0.55);

// The captured period: 75 in-scale moves between -30% and +30% and three size cuts far off the
// right end of the axis (+100%, +100%, +243%).
const dots: SwarmDot[] = fx.changes.map((change) => ({
  id: change.product.id,
  value: Number(change.unit_price_change_pct ?? change.price_change_pct),
}));
const inScale = dots.filter((dot) => !isOffScale(dot.value));
const lowest = inScale.reduce((a, b) => (b.value < a.value ? b : a));
const highest = inScale.reduce((a, b) => (b.value > a.value ? b : a));

const DOWN = { id: lowest.id, label: "Purina ONE", price: "$25.99 to $18.99", percent: `${MINUS}27.3% per lb` };
const UP = {
  id: highest.id,
  label: "Kodiak Protein-Packed Buttermilk and Vanilla Frozen Thick and Fluffy Power Waffles",
  price: "$6.49 to $7.99",
  percent: "+23.1% per oz",
};

function inputFor(width: number, height: number, narrow: boolean, compact: boolean): SwarmChartInput {
  return {
    dots,
    width,
    height,
    narrow,
    compact,
    down: DOWN,
    up: UP,
    offCount: dots.length - inScale.length,
    offText: "listed size went down",
  };
}

const STAGES = [
  { name: "phone, 328 wide", width: 328, height: 284, narrow: true, compact: true, ticks: [`${MINUS}30%`, "0", "+30%"] },
  { name: "phone, 358 wide", width: 358, height: 333, narrow: true, compact: true, ticks: [`${MINUS}30%`, "0", "+30%"] },
  {
    name: "tablet band, 736 wide",
    width: 736,
    height: 396,
    narrow: false,
    compact: true,
    ticks: [`${MINUS}30%`, `${MINUS}15%`, "0", "+15%", "+30%"],
  },
  {
    name: "desktop, 782 wide",
    width: 782,
    height: 700,
    narrow: false,
    compact: false,
    ticks: [`${MINUS}30%`, `${MINUS}20%`, `${MINUS}10%`, "0", "+10%", "+20%", "+30%"],
  },
];

interface Span {
  x0: number;
  x1: number;
}

function textBox(t: ChartText, w: number): Span {
  const x0 = t.anchor === "start" ? t.x : t.anchor === "end" ? t.x - w : t.x - w / 2;
  return { x0, x1: x0 + w };
}

function overlaps(a: Span, b: Span): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1;
}

describe("layoutSwarmChart", () => {
  for (const stage of STAGES) {
    const { width, height, narrow, compact } = stage;
    const fonts = narrow ? CHART_FONTS.narrow : CHART_FONTS.wide;
    const chart: SwarmChart = layoutSwarmChart(inputFor(width, height, narrow, compact), measureText);
    const tickBox = (t: ChartText) => textBox(t, measureText(t.text, fonts.tick, 400));
    const captionBox = (t: ChartText) => textBox(t, measureText(t.text, fonts.caption, 600));

    describe(stage.name, () => {
      it("labels both annotated dots, the axis, and the off-scale column", () => {
        expect(chart.annotations.map((a) => a.id).sort()).toEqual([lowest.id, highest.id].sort());
        expect(chart.ticks.map((t) => t.text)).toEqual(stage.ticks);
        expect(chart.offTicks.map((t) => t.text)).toEqual(["+100%", "+243%"]);
        expect(chart.captions).toHaveLength(2);
        const off = chart.offLabel!;
        expect(off.rows.filter((row) => row.bold).map((row) => row.text).join(" ")).toBe("3 off the scale");
        expect(off.rows.filter((row) => !row.bold).map((row) => row.text).join(" ")).toBe("listed size went down");
        expect(off.anchor).toBe("end");
      });

      it("puts the numbers on one row on wide stages and two on narrow ones", () => {
        const down = chart.annotations.find((a) => a.id === DOWN.id)!;
        const numbers = down.rows.filter((row) => !row.bold).map((row) => row.text);
        expect(numbers).toEqual(narrow ? [DOWN.price, DOWN.percent] : [`${DOWN.price}, ${DOWN.percent}`]);
        const up = chart.annotations.find((a) => a.id === UP.id)!;
        // The long name is cut to its brand and last words on two rows.
        const name = up.rows.filter((row) => row.bold).map((row) => row.text);
        expect(name.length).toBe(2);
        expect(name.join(" ")).toMatch(/^Kodiak … (\S+ )*Power Waffles$/);
      });

      it("keeps every text box inside the stage", () => {
        for (const a of chart.annotations) {
          expect(a.x0).toBeGreaterThanOrEqual(0);
          expect(a.x1).toBeLessThanOrEqual(width);
        }
        for (const t of [...chart.ticks, ...chart.offTicks]) {
          const box = tickBox(t);
          expect(box.x0).toBeGreaterThanOrEqual(0);
          expect(box.x1).toBeLessThanOrEqual(width);
        }
        for (const c of chart.captions) {
          const box = captionBox(c);
          expect(box.x0).toBeGreaterThanOrEqual(0);
          expect(box.x1).toBeLessThanOrEqual(width);
        }
        const off = chart.offLabel!;
        const offWidth = Math.max(...off.rows.map((row) => measureText(row.text, fonts.ann, row.bold ? 700 : 400)));
        const offX0 = off.anchor === "end" ? off.x - offWidth : off.x;
        expect(offX0).toBeGreaterThanOrEqual(0);
        expect(offX0 + offWidth).toBeLessThanOrEqual(width);
      });

      it("keeps tick labels apart", () => {
        const boxes = [...chart.ticks, ...chart.offTicks].map(tickBox);
        for (let i = 0; i < boxes.length; i += 1) {
          for (let j = i + 1; j < boxes.length; j += 1) {
            expect(overlaps(boxes[i]!, boxes[j]!)).toBe(false);
          }
        }
      });

      it("keeps the two annotations apart", () => {
        const [a, b] = chart.annotations;
        expect(a && b).toBeTruthy();
        const crosses = overlaps(a!, b!) && a!.top < b!.bottom && b!.top < a!.bottom;
        expect(crosses).toBe(false);
      });

      it("fits between the stage top and bottom", () => {
        for (const a of chart.annotations) expect(a.top).toBeGreaterThanOrEqual(0);
        for (const c of chart.captions) expect(c.y).toBeLessThanOrEqual(height);
        expect(chart.axisY).toBeGreaterThan(chart.swarm.maxY);
        for (const t of [...chart.ticks, ...chart.offTicks]) expect(t.y).toBeGreaterThan(chart.axisY);
        for (const c of chart.captions) expect(c.y).toBeGreaterThan(chart.ticks[0]!.y);
      });
    });
  }

  it("uses the long captions when they fit and the short pair on a phone", () => {
    const wide = layoutSwarmChart(inputFor(782, 700, false, false), measureText);
    expect(wide.captions.map((c) => c.text)).toEqual(["← Price per unit fell", "Price per unit rose →"]);
    const phone = layoutSwarmChart(inputFor(328, 284, true, true), measureText);
    expect(phone.captions.map((c) => c.text)).toEqual(["← Fell", "Rose →"]);
  });

  it("has no off-scale label or ticks when nothing is off the scale", () => {
    const input = { ...inputFor(782, 700, false, false), dots: inScale, offCount: 0 };
    const chart = layoutSwarmChart(input, measureText);
    expect(chart.offLabel).toBeNull();
    expect(chart.offTicks).toEqual([]);
    expect(chart.swarm.right).toBeNull();
  });

  it("draws no annotations when there are none", () => {
    const chart = layoutSwarmChart({ ...inputFor(782, 700, false, false), down: null, up: null }, measureText);
    expect(chart.annotations).toEqual([]);
    expect(chart.ticks.map((t) => t.text)).toContain("0");
  });
});
