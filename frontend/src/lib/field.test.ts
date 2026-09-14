import { describe, expect, it } from "vitest";
import * as fx from "../api/fixtures";
import { layoutField, nearestDot, pitchFor } from "./field";

const WIDTH = 520;
const OPTIONS = { pitch: 9, gap: 14, labelHeight: 18 };

describe("layoutField", () => {
  const layout = layoutField(fx.field.products, WIDTH, OPTIONS);

  it("places every product exactly once, inside its own block", () => {
    expect(layout.xs).toHaveLength(fx.field.products.length);
    expect(new Set(layout.order).size).toBe(fx.field.products.length);
    expect(layout.blocks.reduce((sum, block) => sum + block.count, 0)).toBe(fx.field.products.length);
    for (const block of layout.blocks) {
      for (let dot = block.start; dot < block.start + block.count; dot += 1) {
        expect(layout.xs[dot]).toBeGreaterThan(block.x);
        expect(layout.xs[dot]).toBeLessThan(block.x + block.width);
        expect(layout.ys[dot]).toBeGreaterThan(block.y);
        expect(layout.ys[dot]).toBeLessThan(block.y + block.height - OPTIONS.labelHeight);
      }
    }
    expect(layout.height).toBeGreaterThan(0);
    expect(layout.blocks.every((block) => block.y + block.height <= layout.height)).toBe(true);
  });

  it("keeps blocks inside the width and a gap apart", () => {
    for (const a of layout.blocks) {
      expect(a.x + a.width).toBeLessThanOrEqual(WIDTH);
      for (const b of layout.blocks) {
        if (a === b) continue;
        const apart =
          a.x + a.width + OPTIONS.gap <= b.x ||
          b.x + b.width + OPTIONS.gap <= a.x ||
          a.y + a.height + OPTIONS.gap <= b.y ||
          b.y + b.height + OPTIONS.gap <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it("starts with the largest category and never makes a block narrower than its label", () => {
    expect(layout.blocks[0]?.category).toBe("Pantry");
    const wide = layoutField(fx.field.products, WIDTH, { ...OPTIONS, labelWidth: () => 200 });
    for (const block of wide.blocks) expect(block.width).toBeGreaterThanOrEqual(200);
  });

  it("handles an empty list", () => {
    const empty = layoutField([], WIDTH, OPTIONS);
    expect(empty.blocks).toHaveLength(0);
    expect(empty.height).toBe(0);
  });
});

describe("nearestDot", () => {
  const layout = layoutField(fx.field.products, WIDTH, OPTIONS);

  it("returns the closest dot within the radius and -1 outside it", () => {
    expect(nearestDot(layout, layout.xs[5]! + 2, layout.ys[5]! - 1, 7)).toBe(5);
    expect(nearestDot(layout, -50, -50, 7)).toBe(-1);
    // Three pixels from dot 5 and six from its neighbour: nothing within a two pixel radius.
    expect(nearestDot(layout, layout.xs[5]! + 3, layout.ys[5]!, 2)).toBe(-1);
  });
});

describe("pitchFor", () => {
  it("packs tighter as the panel gets narrower", () => {
    expect(pitchFor(600)).toBe(9);
    expect(pitchFor(450)).toBe(8);
    expect(pitchFor(320)).toBe(7);
  });
});
