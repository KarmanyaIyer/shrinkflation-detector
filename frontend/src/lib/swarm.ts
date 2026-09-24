// Beeswarm layout for the unit price change chart. Pure functions, no DOM.
//
// Values within OFF_SCALE percent sit on a symmetric axis whose extent is the smallest round
// number that holds them. Anything beyond is an outlier, drawn in a separate zone past a break
// in the axis so one 243% move does not flatten the rest into a line.

export const OFF_SCALE = 50;

export interface SwarmDot {
  id: string;
  value: number;
}

export interface SwarmOptions {
  width: number;
  height: number;
  narrow: boolean;
}

export interface OffColumn {
  x: number;
  // Representative value for the label, the mean of the column's values.
  value: number;
  ids: string[];
}

export interface OffZone {
  x0: number;
  x1: number;
  columns: OffColumn[];
}

export interface SwarmLayout {
  cap: number;
  ticks: number[];
  x0: number;
  x1: number;
  cy: number;
  r: number;
  minY: number;
  maxY: number;
  positions: Map<string, { x: number; y: number }>;
  right: OffZone | null;
  left: OffZone | null;
  sx: (value: number) => number;
}

// The smallest round extent that holds every in-scale value, at least 10.
export function capFor(values: number[]): number {
  const largest = Math.max(0, ...values.map((v) => Math.abs(v)));
  const steps = [10, 15, 20, 25, 30, 40, 50];
  return steps.find((step) => step >= largest) ?? 50;
}

// Tick values for a symmetric axis, at most `most` of them so the labels do not touch.
export function ticksFor(cap: number, most: number): number[] {
  for (const step of [5, 10, 15, 20, 25, 50]) {
    if ((2 * cap) / step + 1 <= most && cap % step === 0) {
      const out: number[] = [];
      for (let v = -cap; v <= cap; v += step) out.push(v);
      return out;
    }
  }
  return [-cap, 0, cap];
}

export function isOffScale(value: number): boolean {
  return Math.abs(value) > OFF_SCALE;
}

// Groups outliers into at most three columns by value, so a label fits under each.
function offColumns(dots: SwarmDot[], x0: number, x1: number): OffColumn[] {
  const sorted = [...dots].sort((a, b) => a.value - b.value);
  const groups: SwarmDot[][] = [];
  for (const dot of sorted) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(last[0]!.value - dot.value) < 0.5) last.push(dot);
    else groups.push([dot]);
  }
  while (groups.length > 3) {
    // Merge the two closest neighbouring groups.
    let best = 0;
    let gap = Number.POSITIVE_INFINITY;
    for (let i = 0; i < groups.length - 1; i += 1) {
      const d = groups[i + 1]![0]!.value - groups[i]![0]!.value;
      if (d < gap) {
        gap = d;
        best = i;
      }
    }
    groups.splice(best, 2, [...groups[best]!, ...groups[best + 1]!]);
  }
  const n = groups.length;
  return groups.map((group, i) => ({
    x: n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1),
    value: group.reduce((sum, dot) => sum + dot.value, 0) / group.length,
    ids: group.map((dot) => dot.id),
  }));
}

export function layoutSwarm(dots: SwarmDot[], options: SwarmOptions): SwarmLayout {
  const { width, height, narrow } = options;
  const inScale = dots.filter((dot) => !isOffScale(dot.value)).sort((a, b) => a.value - b.value);
  const rightDots = dots.filter((dot) => dot.value > OFF_SCALE);
  const leftDots = dots.filter((dot) => dot.value < -OFF_SCALE);
  const cap = capFor(inScale.map((dot) => dot.value));

  const zoneWidth = narrow ? 84 : 128;
  const pad = narrow ? 8 : 12;
  const breakGap = narrow ? 30 : 48;
  const leftZone = leftDots.length ? zoneWidth + breakGap : 0;
  const rightZone = rightDots.length ? zoneWidth + breakGap : 0;
  const x0 = pad + leftZone;
  const x1 = Math.max(x0 + 40, width - pad - rightZone);
  // A tick label needs about 56 px on a phone and 80 px with the larger desktop type.
  const ticks = ticksFor(cap, Math.max(3, Math.min(7, Math.floor((x1 - x0) / (narrow ? 56 : 80)))));
  const sx = (value: number) => x0 + ((value + cap) / (2 * cap)) * (x1 - x0);
  const cy = Math.round(height * (narrow ? 0.56 : 0.5));

  // Radius shrinks until the tallest column fits the stage.
  let r = narrow ? 4.4 : 7;
  let positions = new Map<string, { x: number; y: number }>();
  let minY = cy;
  let maxY = cy;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    positions = new Map();
    minY = cy;
    maxY = cy;
    const gap = narrow ? 1 : 1.6;
    const D = 2 * r + gap;
    const placed: { x: number; y: number }[] = [];
    let windowStart = 0;
    for (const dot of inScale) {
      const x = sx(dot.value);
      while (windowStart < placed.length && placed[windowStart]!.x < x - D) windowStart += 1;
      let y = cy;
      for (let k = 0; k < 2000; k += 1) {
        const off = k === 0 ? 0 : k % 2 ? (k + 1) / 2 : -k / 2;
        const yy = cy + off;
        let free = true;
        for (let i = windowStart; i < placed.length; i += 1) {
          const o = placed[i]!;
          if ((o.x - x) ** 2 + (o.y - yy) ** 2 < D * D) {
            free = false;
            break;
          }
        }
        if (free) {
          y = yy;
          break;
        }
      }
      placed.push({ x, y });
      positions.set(dot.id, { x, y });
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const room = height * (narrow ? 0.34 : 0.36);
    if (maxY - minY <= room || r <= 2) break;
    r = Math.max(2, r * 0.8);
  }
  const D = 2 * r + (narrow ? 1 : 1.6);
  minY = Math.min(minY, cy - D);
  maxY = Math.max(maxY, cy + D);

  const stack = (zone: OffZone) => {
    for (const column of zone.columns) {
      column.ids.forEach((id, i) => {
        positions.set(id, { x: column.x, y: cy + (i - (column.ids.length - 1) / 2) * D });
      });
      minY = Math.min(minY, cy - ((column.ids.length - 1) / 2) * D - D);
      maxY = Math.max(maxY, cy + ((column.ids.length - 1) / 2) * D + D);
    }
  };
  let right: OffZone | null = null;
  if (rightDots.length) {
    const zx0 = x1 + breakGap;
    const zx1 = width - pad - (narrow ? 4 : 8);
    right = { x0: zx0, x1: zx1, columns: offColumns(rightDots, zx0 + (narrow ? 6 : 10), zx1 - (narrow ? 6 : 10)) };
    stack(right);
  }
  let left: OffZone | null = null;
  if (leftDots.length) {
    const zx0 = pad + (narrow ? 4 : 8);
    const zx1 = x0 - breakGap;
    left = { x0: zx0, x1: zx1, columns: offColumns(leftDots, zx0 + (narrow ? 6 : 10), zx1 - (narrow ? 6 : 10)) };
    stack(left);
  }

  return { cap, ticks, x0, x1, cy, r, minY, maxY, positions, right, left, sx };
}
