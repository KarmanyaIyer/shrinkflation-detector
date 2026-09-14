// Canvas drawing and pointer handling for the product map. Kept outside React state: the
// hover lens, the load-in wave, the scan sweep while the assistant works, and the pulse on
// the products it touched all run on the animation frame, and only a changed hover target
// reaches React (for the tooltip).

import type { FieldProduct } from "../api/types";
import { layoutField, nearestDot, pitchFor, type FieldLayout } from "../lib/field";

const COLORS = {
  dot: "#cdcdc7",
  shrink: "#c8321a",
  price_increase: "#e0895a",
  grow: "#2f7d4f",
  price_decrease: "#55a078",
  ink: "#141414",
  label: "#4c4c47",
  count: "#6f6f6a",
};

const LABEL_FONT = "400 10.5px 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const LENS_RADIUS = 46;
const BIRTH_MS = 320;
const BIRTH_SPREAD_MS = 700;
const SCAN_PERIOD_MS = 1500;
const SCAN_HALF_WIDTH = 44;
const PULSE_MS = 1100;
const LABEL_HEIGHT = 18;
const GAP = 14;

export interface RendererCallbacks {
  onHover: (productIndex: number, x: number, y: number) => void;
  onSelect: (productIndex: number) => void;
}

function colorFor(change: string | null | undefined): string {
  if (!change) return COLORS.dot;
  if (change === "shrink" || change === "shrink_price_cut") return COLORS.shrink;
  if (change === "price_increase") return COLORS.price_increase;
  if (change === "grow") return COLORS.grow;
  if (change === "price_decrease") return COLORS.price_decrease;
  return COLORS.dot;
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

export class FieldRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private layout: FieldLayout | null = null;
  private colors: string[] = [];
  private changed: Uint8Array = new Uint8Array(0);
  private readonly indexById = new Map<string, number>();
  private dotByProduct: Int32Array = new Int32Array(0);
  private width = 0;
  private dpr = 1;
  private mouse: { x: number; y: number } | null = null;
  private hovered = -1;
  private pointerType = "mouse";
  private bornAt = 0;
  private scanning = false;
  private scanStart = 0;
  private highlighted: number[] = [];
  private pulseStart = 0;
  private frame = 0;
  private destroyed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly products: FieldProduct[],
    private readonly reduced: boolean,
    private readonly callbacks: RendererCallbacks,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable");
    this.ctx = ctx;
    products.forEach((product, index) => this.indexById.set(product.id, index));
    this.colors = products.map((product) => colorFor(product.change));
    this.changed = Uint8Array.from(products, (product) => (product.change ? 1 : 0));
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("click", this.onClick);
    if (typeof document !== "undefined" && document.fonts?.ready) {
      void document.fonts.ready.then(() => this.requestFrame());
    }
  }

  // Lays the map out for a width and returns the height it needs.
  resize(width: number): number {
    const pitch = pitchFor(width);
    this.ctx.font = LABEL_FONT;
    const labelWidth = (category: string, count: number) =>
      this.ctx.measureText(category).width + 6 + this.ctx.measureText(String(count)).width + 4;
    this.layout = layoutField(this.products, width, { pitch, gap: GAP, labelHeight: LABEL_HEIGHT, labelWidth });
    this.dotByProduct = new Int32Array(this.products.length).fill(-1);
    this.layout.order.forEach((productIndex, dot) => {
      this.dotByProduct[productIndex] = dot;
    });
    this.width = width;
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    // Dot order depends on the width, so a hover index from the old layout is meaningless.
    this.mouse = null;
    this.setHovered(-1, 0, 0);
    const height = Math.ceil(this.layout.height);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    if (!this.bornAt) this.bornAt = performance.now();
    this.requestFrame();
    return height;
  }

  setScanning(on: boolean): void {
    if (on === this.scanning) return;
    this.scanning = on;
    if (on) this.scanStart = performance.now();
    this.requestFrame();
  }

  setHighlight(ids: string[]): void {
    this.highlighted = ids
      .map((id) => this.indexById.get(id))
      .filter((index): index is number => index !== undefined);
    this.pulseStart = this.highlighted.length ? performance.now() : 0;
    this.requestFrame();
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("click", this.onClick);
  }

  private readonly onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    this.pointerType = "mouse";
    this.locate(event.clientX, event.clientY);
  };

  private readonly onPointerLeave = () => {
    // Touch screens fire pointerleave right after every tap, before the click arrives, so a
    // tapped square keeps its tooltip until the next tap lands somewhere else.
    if (this.pointerType === "touch") return;
    this.mouse = null;
    this.setHovered(-1, 0, 0);
    this.requestFrame();
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    this.pointerType = event.pointerType;
  };

  private readonly onClick = (event: MouseEvent) => {
    if (!this.layout) return;
    if (this.pointerType === "touch") {
      // Squares are small under a finger: the first tap names the product, a second tap on the
      // same square opens it. Scrolling never produces a click, so nothing pops up mid-scroll.
      const before = this.hovered;
      this.locate(event.clientX, event.clientY);
      if (this.hovered < 0 || this.hovered !== before) return;
    }
    if (this.hovered >= 0) {
      event.preventDefault();
      this.callbacks.onSelect(this.layout.order[this.hovered]!);
    }
  };

  private locate(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    this.mouse = { x, y };
    if (this.layout) {
      const dot = nearestDot(this.layout, x, y, Math.max(7, this.layout.pitch * 0.75));
      this.setHovered(dot, x, y);
    }
    this.requestFrame();
  }

  private setHovered(dot: number, x: number, y: number): void {
    if (dot === this.hovered) return;
    this.hovered = dot;
    this.canvas.style.cursor = dot >= 0 ? "pointer" : "";
    if (!this.layout) return;
    if (dot >= 0) {
      this.callbacks.onHover(this.layout.order[dot]!, this.layout.xs[dot]!, this.layout.ys[dot]!);
    } else {
      this.callbacks.onHover(-1, x, y);
    }
  }

  private requestFrame(): void {
    if (this.destroyed || this.frame) return;
    this.frame = requestAnimationFrame(this.tick);
  }

  private readonly tick = () => {
    this.frame = 0;
    if (this.destroyed || !this.layout) return;
    const now = performance.now();
    this.draw(now);
    if (this.animating(now)) this.requestFrame();
  };

  private animating(now: number): boolean {
    if (this.scanning) return true;
    if (!this.reduced && now - this.bornAt < BIRTH_SPREAD_MS + BIRTH_MS + 50) return true;
    if (this.pulseStart && now - this.pulseStart < PULSE_MS + 50) return true;
    return false;
  }

  private draw(now: number): void {
    const layout = this.layout;
    if (!layout) return;
    const { ctx, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, layout.height);

    ctx.font = LABEL_FONT;
    ctx.textBaseline = "alphabetic";
    for (const block of layout.blocks) {
      const y = block.y + block.height - 4;
      ctx.fillStyle = COLORS.label;
      ctx.fillText(block.category, block.x, y);
      const labelWidth = ctx.measureText(block.category).width;
      ctx.fillStyle = COLORS.count;
      ctx.fillText(String(block.count), block.x + labelWidth + 6, y);
    }

    const base = layout.pitch * 0.44;
    const mouse = this.mouse;
    const lens2 = LENS_RADIUS * LENS_RADIUS;
    const born = this.reduced ? Number.POSITIVE_INFINITY : now - this.bornAt;
    const scanX = this.scanning
      ? (((now - this.scanStart) % SCAN_PERIOD_MS) / SCAN_PERIOD_MS) * (this.width + 2 * SCAN_HALF_WIDTH) -
        SCAN_HALF_WIDTH
      : null;

    // Plain and changed dots are batched by color. The scan band and lens change size and
    // alpha per dot, so those few dots are drawn one by one afterwards.
    const byColor = new Map<string, number[]>();
    const singles: number[] = [];
    for (let dot = 0; dot < layout.xs.length; dot += 1) {
      const x = layout.xs[dot]!;
      const y = layout.ys[dot]!;
      if (born < BIRTH_SPREAD_MS + BIRTH_MS) {
        const delay = (x / this.width) * BIRTH_SPREAD_MS;
        if (born < delay) continue;
      }
      let special = false;
      if (mouse) {
        const dx = x - mouse.x;
        const dy = y - mouse.y;
        if (dx * dx + dy * dy < lens2) special = true;
      }
      if (scanX !== null && Math.abs(x - scanX) < SCAN_HALF_WIDTH) special = true;
      if (born < BIRTH_SPREAD_MS + BIRTH_MS) special = true;
      if (special) {
        singles.push(dot);
        continue;
      }
      const color = this.colors[layout.order[dot]!]!;
      const list = byColor.get(color);
      if (list) list.push(dot);
      else byColor.set(color, [dot]);
    }

    for (const [color, dots] of byColor) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (const dot of dots) {
        const size = this.changed[layout.order[dot]!] ? base * 1.6 : base;
        ctx.rect(layout.xs[dot]! - size / 2, layout.ys[dot]! - size / 2, size, size);
      }
      ctx.fill();
    }

    for (const dot of singles) {
      const x = layout.xs[dot]!;
      const y = layout.ys[dot]!;
      const productIndex = layout.order[dot]!;
      let size = this.changed[productIndex] ? base * 1.6 : base;
      let alpha = 1;
      let color = this.colors[productIndex]!;
      if (born < BIRTH_SPREAD_MS + BIRTH_MS) {
        const delay = (x / this.width) * BIRTH_SPREAD_MS;
        const t = Math.min(1, (born - delay) / BIRTH_MS);
        size *= easeOut(t);
        alpha = t;
      }
      if (mouse) {
        const dx = x - mouse.x;
        const dy = y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < lens2) {
          const t = 1 - Math.sqrt(d2) / LENS_RADIUS;
          size *= 1 + 0.9 * t * t;
        }
      }
      if (scanX !== null) {
        const t = 1 - Math.abs(x - scanX) / SCAN_HALF_WIDTH;
        if (t > 0 && !this.changed[productIndex]) {
          color = COLORS.ink;
          alpha *= 0.35 + 0.65 * t;
        }
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;

    if (this.highlighted.length) {
      const age = this.pulseStart ? now - this.pulseStart : PULSE_MS;
      const t = Math.min(1, age / PULSE_MS);
      for (const productIndex of this.highlighted) {
        const dot = this.dotByProduct[productIndex]!;
        if (dot < 0) continue;
        const x = layout.xs[dot]!;
        const y = layout.ys[dot]!;
        const ring = base * 2.4;
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = 1.25;
        ctx.strokeRect(x - ring / 2, y - ring / 2, ring, ring);
        if (t < 1 && !this.reduced) {
          const spread = ring + easeOut(t) * base * 6;
          ctx.globalAlpha = 1 - t;
          ctx.strokeRect(x - spread / 2, y - spread / 2, spread, spread);
          ctx.globalAlpha = 1;
        }
      }
    }

    if (this.hovered >= 0) {
      const dot = this.hovered;
      const x = layout.xs[dot]!;
      const y = layout.ys[dot]!;
      const size = base * 2.4;
      ctx.fillStyle = this.colors[layout.order[dot]!]!;
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - size / 2 - 2, y - size / 2 - 2, size + 4, size + 4);
    }
  }
}
