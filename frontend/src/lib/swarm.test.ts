import { describe, expect, it } from "vitest";
import * as fx from "../api/fixtures";
import { capFor, isOffScale, layoutSwarm, ticksFor, type SwarmDot } from "./swarm";

const dots: SwarmDot[] = fx.changes.map((change) => ({
  id: change.product.id,
  value: Number(change.unit_price_change_pct),
}));

describe("layoutSwarm", () => {
  const layout = layoutSwarm(dots, { width: 780, height: 700, narrow: false });

  it("places every dot without overlap and keeps in-scale dots on their value", () => {
    expect(layout.positions.size).toBe(dots.length);
    const placed = [...layout.positions.values()];
    const D = 2 * layout.r;
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const a = placed[i]!;
        const b = placed[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(D - 0.01);
      }
    }
    for (const dot of dots) {
      if (isOffScale(dot.value)) continue;
      expect(layout.positions.get(dot.id)!.x).toBeCloseTo(layout.sx(dot.value), 5);
    }
  });

  it("uses a 30% axis and a broken right zone for the three shrinks", () => {
    expect(layout.cap).toBe(30);
    expect(layout.ticks).toEqual([-30, -20, -10, 0, 10, 20, 30]);
    expect(layout.left).toBeNull();
    expect(layout.right).not.toBeNull();
    const columns = layout.right!.columns;
    expect(columns.map((c) => Math.round(c.value))).toEqual([100, 243]);
    expect(columns[0]!.ids).toHaveLength(2);
    expect(columns[1]!.ids).toEqual([fx.ids.huggies]);
    expect(layout.right!.x0).toBeGreaterThan(layout.x1);
    for (const column of columns) expect(column.x).toBeLessThanOrEqual(780);
  });

  it("keeps everything inside the stage on a phone", () => {
    const narrow = layoutSwarm(dots, { width: 358, height: 360, narrow: true });
    expect(narrow.ticks).toEqual([-30, 0, 30]);
    for (const { x, y } of narrow.positions.values()) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(358);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(360);
    }
    expect(narrow.maxY - narrow.minY).toBeLessThan(360 * 0.6);
  });

  it("has no break when nothing is off the scale, and a left zone for large cuts", () => {
    const plain = layoutSwarm(
      dots.filter((d) => !isOffScale(d.value)),
      { width: 780, height: 700, narrow: false },
    );
    expect(plain.right).toBeNull();
    expect(plain.x1).toBeGreaterThan(700);
    const cuts = layoutSwarm([...dots, { id: "x", value: -80 }], { width: 780, height: 700, narrow: false });
    expect(cuts.left!.columns[0]!.ids).toEqual(["x"]);
    expect(cuts.left!.x1).toBeLessThan(cuts.x0);
  });

  it("merges outliers into at most three labelled columns", () => {
    const many = [60, 70, 80, 90, 120, 300].map((value, i) => ({ id: String(i), value }));
    const layout = layoutSwarm(many, { width: 780, height: 700, narrow: false });
    expect(layout.right!.columns).toHaveLength(3);
    expect(layout.right!.columns.flatMap((c) => c.ids)).toHaveLength(6);
  });

  it("shrinks the radius when a column would not fit", () => {
    const stacked = Array.from({ length: 60 }, (_, i) => ({ id: String(i), value: 5 }));
    const layout = layoutSwarm(stacked, { width: 780, height: 300, narrow: false });
    expect(layout.r).toBe(2);
    const spread = Array.from({ length: 36 }, (_, i) => ({ id: String(i), value: (i % 3) * 4 }));
    const fits = layoutSwarm(spread, { width: 780, height: 300, narrow: false });
    expect(fits.r).toBeLessThan(7);
    expect(fits.maxY - fits.minY).toBeLessThanOrEqual(300 * 0.36 + 4 * fits.r);
  });
});

describe("scale helpers", () => {
  it("picks the smallest round cap and readable ticks", () => {
    expect(capFor([3, -27.3, 23.1])).toBe(30);
    expect(capFor([4, -8])).toBe(10);
    expect(capFor([])).toBe(10);
    expect(capFor([44])).toBe(50);
    expect(ticksFor(10, 7)).toEqual([-10, -5, 0, 5, 10]);
    expect(ticksFor(50, 5)).toEqual([-50, -25, 0, 25, 50]);
    expect(ticksFor(15, 7)).toEqual([-15, -10, -5, 0, 5, 10, 15]);
    expect(ticksFor(30, 4)).toEqual([-30, 0, 30]);
    expect(isOffScale(50)).toBe(false);
    expect(isOffScale(50.1)).toBe(true);
  });
});
