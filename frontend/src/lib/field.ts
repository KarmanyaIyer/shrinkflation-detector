// Layout for the product map: one square per tracked product, grouped into a block per
// category. Blocks are packed left to right in shelves, largest category first, so the map
// reads as a set of labelled clusters at any width. Pure functions, no DOM.

import type { FieldProduct } from "../api/types";

export interface FieldBlock {
  category: string;
  count: number;
  x: number;
  y: number;
  width: number;
  height: number;
  cols: number;
  // Index into the layout's dot arrays of this block's first product.
  start: number;
}

export interface FieldLayout {
  width: number;
  height: number;
  pitch: number;
  // Dot centers, one per product, in block order.
  xs: Float32Array;
  ys: Float32Array;
  // Index into the products array for each dot.
  order: Uint32Array;
  blocks: FieldBlock[];
}

export interface FieldOptions {
  // Distance between dot centers.
  pitch: number;
  // Space between blocks.
  gap: number;
  // Room under each block for its label.
  labelHeight: number;
  // Width of each category's label, so a block is never narrower than its caption.
  labelWidth?: (category: string, count: number) => number;
}

export function pitchFor(width: number): number {
  if (width >= 560) return 9;
  if (width >= 400) return 8;
  return 7;
}

export function layoutField(products: FieldProduct[], width: number, options: FieldOptions): FieldLayout {
  const { pitch, gap, labelHeight, labelWidth } = options;
  const groups = new Map<string, number[]>();
  products.forEach((product, index) => {
    const list = groups.get(product.category);
    if (list) list.push(index);
    else groups.set(product.category, [index]);
  });
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  const maxCols = Math.max(1, Math.floor(width / pitch));
  const xs = new Float32Array(products.length);
  const ys = new Float32Array(products.length);
  const order = new Uint32Array(products.length);
  const blocks: FieldBlock[] = [];

  // Blocks lean wide so their labels fit and rows of blocks stay short.
  const pending = ordered.map(([category, indices]) => {
    const count = indices.length;
    const minCols = labelWidth ? Math.ceil(labelWidth(category, count) / pitch) : 1;
    const cols = Math.min(maxCols, Math.max(minCols, Math.ceil(Math.sqrt(count * 1.7))));
    const rows = Math.ceil(count / cols);
    return { category, indices, count, cols, width: cols * pitch, height: rows * pitch + labelHeight };
  });

  // Shelves are filled first-fit: after the widest remaining block, any later block that still
  // fits on the shelf goes on it too, so small categories fill the gaps beside large ones.
  let cursorY = 0;
  let dot = 0;
  while (pending.length > 0) {
    let cursorX = 0;
    let shelfHeight = 0;
    for (let i = 0; i < pending.length; ) {
      const item = pending[i]!;
      if (cursorX > 0 && cursorX + item.width > width) {
        i += 1;
        continue;
      }
      pending.splice(i, 1);
      blocks.push({
        category: item.category,
        count: item.count,
        x: cursorX,
        y: cursorY,
        width: item.width,
        height: item.height,
        cols: item.cols,
        start: dot,
      });
      item.indices.forEach((productIndex, n) => {
        xs[dot] = cursorX + (n % item.cols) * pitch + pitch / 2;
        ys[dot] = cursorY + Math.floor(n / item.cols) * pitch + pitch / 2;
        order[dot] = productIndex;
        dot += 1;
      });
      cursorX += item.width + gap;
      shelfHeight = Math.max(shelfHeight, item.height);
    }
    cursorY += shelfHeight + gap;
  }

  return { width, height: Math.max(0, cursorY - gap), pitch, xs, ys, order, blocks };
}

// Index of the dot closest to a point within radius, or -1.
export function nearestDot(layout: FieldLayout, x: number, y: number, radius: number): number {
  let best = -1;
  let bestDistance = radius * radius;
  for (let i = 0; i < layout.xs.length; i += 1) {
    const dx = layout.xs[i]! - x;
    const dy = layout.ys[i]! - y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}
