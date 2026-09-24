// Layout for the category grid: one row block per category, largest first, with the label
// at the left on wide stages and above the block on narrow ones. Pure functions, no DOM.

export interface GridCategory {
  category: string;
  // Product ids in draw order: changed products first so they cluster at the start of the block.
  ids: string[];
  changes: number;
}

export interface GridLabel {
  name: string;
  count: number;
  changes: number;
  x: number;
  y: number;
  // Where the count sits on wide stages (right aligned).
  countX: number;
  // Where the per-category change count sits, just past the changed dots.
  changeX: number;
  above: boolean;
}

export interface GridLayout {
  positions: Map<string, { x: number; y: number }>;
  r: number;
  pitch: number;
  labels: GridLabel[];
  labelWidth: number;
}

export interface GridOptions {
  width: number;
  height: number;
  narrow: boolean;
}

export const LABEL_WIDTH = 172;

export function layoutGrid(categories: GridCategory[], options: GridOptions): GridLayout {
  const { width, height, narrow } = options;
  const positions = new Map<string, { x: number; y: number }>();
  const labels: GridLabel[] = [];
  if (categories.length === 0) return { positions, r: 2, pitch: 6, labels, labelWidth: 0 };

  if (!narrow) {
    const rows = 4;
    const gapY = 12;
    const maxCols = Math.max(1, ...categories.map((c) => Math.ceil(c.ids.length / rows)));
    const pitch = Math.max(
      3,
      Math.min(12, (width - LABEL_WIDTH) / maxCols, (height - 6 - gapY * (categories.length - 1)) / (rows * categories.length)),
    );
    const blockH = rows * pitch;
    let y = 3;
    for (const entry of categories) {
      labels.push({
        name: entry.category,
        count: entry.ids.length,
        changes: entry.changes,
        x: 0,
        y: y + blockH / 2,
        countX: LABEL_WIDTH - 16,
        changeX: LABEL_WIDTH + Math.ceil(entry.changes / rows) * pitch + 5,
        above: false,
      });
      entry.ids.forEach((id, i) => {
        positions.set(id, {
          x: LABEL_WIDTH + Math.floor(i / rows) * pitch + pitch / 2,
          y: y + (i % rows) * pitch + pitch / 2,
        });
      });
      y += blockH + gapY;
    }
    return { positions, r: pitch * 0.37, pitch, labels, labelWidth: LABEL_WIDTH };
  }

  const labelH = 16;
  const gapY = 5;
  let cols = 140;
  for (let candidate = 34; candidate <= 140; candidate += 1) {
    const pitch = width / candidate;
    let total = -gapY;
    for (const entry of categories) total += labelH + Math.ceil(entry.ids.length / candidate) * pitch + gapY;
    if (total <= height - 2) {
      cols = candidate;
      break;
    }
  }
  const pitch = width / cols;
  let y = 0;
  for (const entry of categories) {
    const rows = Math.max(1, Math.ceil(entry.ids.length / cols));
    labels.push({
      name: entry.category,
      count: entry.ids.length,
      changes: entry.changes,
      x: 0,
      y: y + 11,
      countX: 0,
      changeX: 0,
      above: true,
    });
    y += labelH;
    entry.ids.forEach((id, i) => {
      positions.set(id, { x: Math.floor(i / rows) * pitch + pitch / 2, y: y + (i % rows) * pitch + pitch / 2 });
    });
    y += rows * pitch + gapY;
  }
  return { positions, r: Math.max(1.3, pitch * 0.36), pitch, labels, labelWidth: 0 };
}
