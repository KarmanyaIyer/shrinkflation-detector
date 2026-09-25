// Canvas engine for the pinned story graphic. Every product is a dot with a position, radius,
// alpha, and color. A step change sets a target per dot and tweens toward it over 700 ms with
// an ease-in-out curve; the animation frame loop runs only while a tween is in flight, and any
// other redraw (hover, highlight, resize) is a single draw call. Kept outside React state so a
// hover never re-renders the page.

import type { GridLayout } from "../lib/grid";
import type { SwarmLayout } from "../lib/swarm";
import type { StepKind } from "../lib/story";

export const TWEEN_MS = 700;
const DELAY_SPREAD_MS = 240;

const RGB = {
  neutral: [196, 196, 196] as const,
  more: [228, 87, 46] as const,
  less: [23, 130, 122] as const,
};

export interface DotInput {
  id: string;
  // "more", "less", or null for an unchanged product.
  direction: "more" | "less" | null;
  // true for size changes, which get their own steps.
  sizeKind: "shrink" | "grow" | null;
}

export interface Geometry {
  width: number;
  height: number;
  dpr: number;
  narrow: boolean;
  // The size cards are the one-group-at-a-time rows of a short stage, so the dots of the group
  // not shown are hidden instead of dimmed.
  compactCards: boolean;
  grid: GridLayout;
  swarm: SwarmLayout;
  // Centers of the card dots for the size steps, measured from the DOM.
  cards: Map<string, { x: number; y: number }>;
}

interface Target {
  x: number;
  y: number;
  r: number;
  a: number;
  c: readonly [number, number, number];
}

interface Dot extends DotInput {
  x: number;
  y: number;
  r: number;
  a: number;
  c: [number, number, number];
  from: Target;
  to: Target;
  delay: number;
}

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class GraphicRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly dots: Dot[];
  private readonly byId = new Map<string, Dot>();
  private readonly drawOrder: Dot[];
  private geometry: Geometry | null = null;
  private step: StepKind;
  private frame = 0;
  private t0 = 0;
  private tweening = false;
  private visible = true;
  private hovered: Dot | null = null;
  private highlighted: Dot | null = null;
  private destroyed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    inputs: DotInput[],
    private readonly reduced: boolean,
    // The step on screen when the renderer is created, so a renderer rebuilt mid-story starts
    // where the reader is.
    initial: StepKind = "grid",
    private readonly onSettled?: () => void,
  ) {
    this.step = initial;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable");
    this.ctx = ctx;
    const blank: Target = { x: 0, y: 0, r: 0, a: 0, c: RGB.neutral };
    this.dots = inputs.map((input) => ({
      ...input,
      x: 0,
      y: 0,
      r: 0,
      a: 0,
      c: [...RGB.neutral] as [number, number, number],
      from: blank,
      to: blank,
      delay: 0,
    }));
    for (const dot of this.dots) this.byId.set(dot.id, dot);
    // Unchanged dots first, then changed, then the size cases, so the ones that matter sit on top.
    this.drawOrder = [...this.dots].sort(
      (a, b) => (a.direction ? 1 : 0) - (b.direction ? 1 : 0) || (a.sizeKind ? 1 : 0) - (b.sizeKind ? 1 : 0),
    );
  }

  get currentStep(): StepKind {
    return this.step;
  }

  // Applies a new layout and jumps every dot to its place in the current step.
  setGeometry(geometry: Geometry): void {
    this.geometry = geometry;
    this.canvas.width = Math.round(geometry.width * geometry.dpr);
    this.canvas.height = Math.round(geometry.height * geometry.dpr);
    this.go(this.step, true);
  }

  // Moves to a step, animated unless `instant`, reduced motion, or the stage is offscreen.
  go(step: StepKind, instant = false): void {
    this.step = step;
    const geometry = this.geometry;
    if (!geometry) return;
    for (const dot of this.dots) {
      const to = this.targetFor(dot, step, geometry);
      dot.from = { x: dot.x, y: dot.y, r: dot.r, a: dot.a, c: [...dot.c] as [number, number, number] };
      dot.to = to;
      const moves = Math.hypot(to.x - dot.x, to.y - dot.y) > 2;
      dot.delay = moves ? (to.x / Math.max(1, geometry.width)) * DELAY_SPREAD_MS : 0;
    }
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    if (instant || this.reduced || !this.visible) {
      for (const dot of this.dots) this.apply(dot, 1);
      this.tweening = false;
      this.draw();
      this.onSettled?.();
      return;
    }
    this.tweening = true;
    this.t0 = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    if (!visible && this.tweening) {
      // Finish offscreen work at once; nobody is watching the tween.
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      for (const dot of this.dots) this.apply(dot, 1);
      this.tweening = false;
      this.draw();
      this.onSettled?.();
    }
  }

  setHover(id: string | null): void {
    const dot = id ? (this.byId.get(id) ?? null) : null;
    if (dot === this.hovered) return;
    this.hovered = dot;
    if (!this.tweening) this.draw();
  }

  setHighlight(id: string | null): void {
    const dot = id ? (this.byId.get(id) ?? null) : null;
    if (dot === this.highlighted) return;
    this.highlighted = dot;
    if (!this.tweening) this.draw();
  }

  positionOf(id: string): { x: number; y: number; r: number; a: number } | null {
    const dot = this.byId.get(id);
    return dot ? { x: dot.x, y: dot.y, r: dot.r, a: dot.a } : null;
  }

  // The dot under a point, or null. Dots faded out of the current step are not pickable.
  pick(x: number, y: number, touch: boolean): string | null {
    if (this.step === "shrinks" || this.step === "grows") return null;
    let best: Dot | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const dot of this.dots) {
      if (dot.a < 0.3) continue;
      const d = (dot.x - x) ** 2 + (dot.y - y) ** 2;
      if (d < bestDistance) {
        bestDistance = d;
        best = dot;
      }
    }
    if (!best) return null;
    return Math.sqrt(bestDistance) <= Math.max(best.r + 5, touch ? 12 : 7) ? best.id : null;
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private targetFor(dot: Dot, step: StepKind, geometry: Geometry): Target {
    const { grid, swarm, cards, narrow, compactCards } = geometry;
    const gp = grid.positions.get(dot.id) ?? { x: 0, y: 0 };
    const color = dot.direction === "more" ? RGB.more : dot.direction === "less" ? RGB.less : RGB.neutral;
    const atGrid = (c: Target["c"], a: number): Target => ({ x: gp.x, y: gp.y, r: grid.r, a, c });
    const sw = swarm.positions.get(dot.id);
    switch (step) {
      case "grid":
        return atGrid(RGB.neutral, 1);
      case "changed":
        return atGrid(color, dot.direction ? 1 : 0.34);
      case "swarm":
        if (dot.direction && sw) return { x: sw.x, y: sw.y, r: swarm.r, a: 1, c: color };
        return atGrid(RGB.neutral, 0);
      case "shrinks":
      case "grows": {
        if (dot.sizeKind) {
          const p = cards.get(dot.id) ?? sw ?? gp;
          const on = step === "shrinks" ? dot.sizeKind === "shrink" : dot.sizeKind === "grow";
          return { x: p.x, y: p.y, r: narrow || compactCards ? 5 : 7, a: on ? 1 : compactCards ? 0 : 0.26, c: color };
        }
        if (dot.direction && sw) return { x: sw.x, y: sw.y, r: swarm.r, a: 0, c: color };
        return atGrid(RGB.neutral, 0);
      }
      default:
        return atGrid(color, 1);
    }
  }

  private apply(dot: Dot, k: number): void {
    const e = ease(k);
    const f = dot.from;
    const t = dot.to;
    dot.x = f.x + (t.x - f.x) * e;
    dot.y = f.y + (t.y - f.y) * e;
    dot.r = f.r + (t.r - f.r) * e;
    dot.a = f.a + (t.a - f.a) * e;
    dot.c[0] = f.c[0] + (t.c[0] - f.c[0]) * e;
    dot.c[1] = f.c[1] + (t.c[1] - f.c[1]) * e;
    dot.c[2] = f.c[2] + (t.c[2] - f.c[2]) * e;
  }

  private readonly tick = (now: number) => {
    this.frame = 0;
    if (this.destroyed) return;
    let done = true;
    for (const dot of this.dots) {
      const k = (now - this.t0 - dot.delay) / TWEEN_MS;
      if (k < 1) done = false;
      this.apply(dot, Math.max(0, Math.min(1, k)));
    }
    this.draw();
    if (done) {
      this.tweening = false;
      this.onSettled?.();
    } else {
      this.frame = requestAnimationFrame(this.tick);
    }
  };

  draw(): void {
    const geometry = this.geometry;
    if (!geometry || this.destroyed) return;
    const { ctx } = this;
    ctx.setTransform(geometry.dpr, 0, 0, geometry.dpr, 0, 0);
    ctx.clearRect(0, 0, geometry.width, geometry.height);
    let lastStyle = "";
    for (const dot of this.drawOrder) {
      if (dot.a < 0.01 || dot.r <= 0) continue;
      ctx.globalAlpha = dot.a;
      const style = `rgb(${dot.c[0] | 0},${dot.c[1] | 0},${dot.c[2] | 0})`;
      if (style !== lastStyle) {
        ctx.fillStyle = style;
        lastStyle = style;
      }
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dot.r, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const marked of [this.hovered, this.highlighted]) {
      if (!marked || marked.a < 0.2) continue;
      ctx.strokeStyle = "#121212";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(marked.x, marked.y, marked.r + 3, 0, 6.2832);
      ctx.stroke();
    }
  }
}
