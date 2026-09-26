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

// Dot rows per category block on a wide stage. The count that gives the largest dots is used:
// a short, wide stage (a tablet in portrait under its pinned band) needs fewer rows than a
// desktop column.
const WIDE_ROWS = [3, 4, 5, 6];

function wideLayout(categories: GridCategory[], width: number, height: number): GridLayout {
  const positions = new Map<string, { x: number; y: number }>();
  const labels: GridLabel[] = [];
  const gapY = 12;
  const largest = Math.max(1, ...categories.map((c) => c.ids.length));
  let rows = 4;
  let pitch = 0;
  for (const candidate of WIDE_ROWS) {
    const fit = Math.min(
      12,
      (width - LABEL_WIDTH) / Math.ceil(largest / candidate),
      (height - 6 - gapY * (categories.length - 1)) / (candidate * categories.length),
    );
    if (fit > pitch + 0.01) {
      rows = candidate;
      pitch = fit;
    }
  }
  pitch = Math.max(3, pitch);
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

// A narrow stage has no room for labels beside the blocks, so each label sits above its block
// and the blocks go two to a row. Every block has the same number of dot rows, taken from the
// largest category, so a block's length is proportional to its count.
function narrowLayout(categories: GridCategory[], width: number, height: number): GridLayout {
  const positions = new Map<string, { x: number; y: number }>();
  const labels: GridLabel[] = [];
  // 11 px labels (set by the overlay) on a 15 px line.
  const labelH = 15;
  const gapY = 4;
  const gapX = 14;
  const columns = categories.length > 1 ? 2 : 1;
  const colW = (width - gapX * (columns - 1)) / columns;
  const bands = Math.ceil(categories.length / columns);
  const largest = Math.max(1, ...categories.map((c) => c.ids.length));
  // The fewest columns (the largest dots) whose blocks fit the stage height.
  let cols = 400;
  for (let candidate = 8; candidate < 400; candidate += 1) {
    const rows = Math.ceil(largest / candidate);
    if (bands * (labelH + gapY) - gapY + bands * rows * (colW / candidate) <= height - 2) {
      cols = candidate;
      break;
    }
  }
  const pitch = colW / cols;
  const rows = Math.ceil(largest / cols);
  const bandH = labelH + rows * pitch + gapY;
  categories.forEach((entry, index) => {
    const x0 = (index % columns) * (colW + gapX);
    const y0 = Math.floor(index / columns) * bandH;
    labels.push({
      name: entry.category,
      count: entry.ids.length,
      changes: entry.changes,
      x: x0,
      y: y0 + 11,
      countX: 0,
      changeX: 0,
      above: true,
    });
    entry.ids.forEach((id, i) => {
      positions.set(id, {
        x: x0 + Math.floor(i / rows) * pitch + pitch / 2,
        y: y0 + labelH + (i % rows) * pitch + pitch / 2,
      });
    });
  });
  return { positions, r: Math.max(1.3, pitch * 0.36), pitch, labels, labelWidth: 0 };
}

export function layoutGrid(categories: GridCategory[], options: GridOptions): GridLayout {
  const { width, height, narrow } = options;
  if (categories.length === 0) return { positions: new Map(), r: 2, pitch: 6, labels: [], labelWidth: 0 };
  return narrow ? narrowLayout(categories, width, height) : wideLayout(categories, width, height);
}
