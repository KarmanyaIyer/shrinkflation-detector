import { describe, expect, it } from "vitest";
import * as fx from "../api/fixtures";
import { LABEL_WIDTH, layoutGrid, type GridCategory } from "./grid";

const categories: GridCategory[] = [...fx.categories]
  .sort((a, b) => b.products - a.products)
  .map((entry) => ({
    category: entry.category,
    ids: fx.field.products.filter((p) => p.category === entry.category).map((p) => p.id),
    changes: entry.changes,
  }));

describe("layoutGrid", () => {
  it("places every product in its category block on a wide stage", () => {
    const layout = layoutGrid(categories, { width: 780, height: 640, narrow: false });
    expect(layout.positions.size).toBe(1242);
    expect(layout.labels).toHaveLength(13);
    expect(layout.labels[0]).toMatchObject({ name: "Pantry", count: 276, changes: 20, above: false });
    for (const { x, y } of layout.positions.values()) {
      expect(x).toBeGreaterThan(LABEL_WIDTH);
      expect(x).toBeLessThan(780);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(640);
    }
    // Changed products are first in each block, so the change count sits right after them.
    const pantry = layout.labels[0]!;
    expect(pantry.changeX).toBeGreaterThan(LABEL_WIDTH);
    expect(pantry.changeX).toBeLessThan(LABEL_WIDTH + 12 * 8);
  });

  it("stacks label-above blocks on a narrow stage without overflowing the height", () => {
    const layout = layoutGrid(categories, { width: 358, height: 330, narrow: true });
    expect(layout.positions.size).toBe(1242);
    expect(layout.labels.every((label) => label.above)).toBe(true);
    for (const { x, y } of layout.positions.values()) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(358);
      expect(y).toBeLessThan(330);
    }
    expect(layout.r).toBeGreaterThanOrEqual(1.3);
  });

  it("handles no categories", () => {
    expect(layoutGrid([], { width: 400, height: 400, narrow: false }).positions.size).toBe(0);
  });
});
