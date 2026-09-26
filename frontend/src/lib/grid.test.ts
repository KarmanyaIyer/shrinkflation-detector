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

  it("picks the dot rows that give the largest dots for the stage", () => {
    const rowsOf = (layout: ReturnType<typeof layoutGrid>, name: string) => {
      const entry = categories.find((c) => c.category === name)!;
      return new Set(entry.ids.map((id) => layout.positions.get(id)!.y)).size;
    };
    const span = (layout: ReturnType<typeof layoutGrid>, name: string) => {
      const entry = categories.find((c) => c.category === name)!;
      const xs = entry.ids.map((id) => layout.positions.get(id)!.x);
      return Math.max(...xs) - Math.min(...xs) + layout.pitch;
    };
    // A desktop column keeps four rows.
    const desktop = layoutGrid(categories, { width: 782, height: 700, narrow: false });
    expect(rowsOf(desktop, "Pantry")).toBe(4);
    // A tablet's short pinned band uses three rows, so the largest block spans the width.
    const tablet = layoutGrid(categories, { width: 736, height: 404, narrow: false });
    expect(rowsOf(tablet, "Pantry")).toBe(3);
    expect(span(tablet, "Pantry")).toBeGreaterThan(0.9 * (736 - LABEL_WIDTH));
    for (const { x, y } of tablet.positions.values()) {
      expect(x).toBeLessThan(736);
      expect(y).toBeLessThan(404);
    }
  });

  it("gives every narrow block the same rows, two blocks to a band, so length follows the count", () => {
    for (const [width, height] of [
      [358, 327],
      [328, 278],
    ] as const) {
      const layout = layoutGrid(categories, { width, height, narrow: true });
      const rows = categories.map((entry) => new Set(entry.ids.map((id) => layout.positions.get(id)!.y)).size);
      expect(new Set(rows).size).toBe(1);
      const length = (name: string) => {
        const entry = categories.find((c) => c.category === name)!;
        const xs = entry.ids.map((id) => layout.positions.get(id)!.x);
        return Math.max(...xs) - Math.min(...xs) + layout.pitch;
      };
      // Pantry (276) draws about 2.3 times as long as Snacks (120).
      expect(length("Pantry") / length("Snacks")).toBeGreaterThan(2);
      expect(length("Pantry") / length("Snacks")).toBeLessThan(2.6);
      expect(new Set(layout.labels.map((label) => label.x)).size).toBe(2);
      for (const { x, y } of layout.positions.values()) {
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(width);
        expect(y).toBeLessThan(height);
      }
      expect(layout.pitch).toBeGreaterThan(3);
    }
  });

  it("handles no categories", () => {
    expect(layoutGrid([], { width: 400, height: 400, narrow: false }).positions.size).toBe(0);
  });
});
