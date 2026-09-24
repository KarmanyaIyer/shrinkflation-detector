import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { CategoryCount, ChangeOut, FieldProduct } from "../api/types";
import { formatInt, formatMoney, formatPercent, quoted, toNumber, unitWord } from "../lib/format";
import { layoutGrid, type GridCategory, type GridLayout } from "../lib/grid";
import { direction, kindDirection, kindLabel } from "../lib/kinds";
import type { Story, StepKind } from "../lib/story";
import { layoutSwarm, type SwarmLayout } from "../lib/swarm";
import { displayName, shortName } from "../lib/text";
import { GraphicRenderer, type DotInput, type Geometry } from "./graphicRenderer";
import { SizeCards } from "./SizeCards";

export interface GraphicProps {
  story: Story;
  products: FieldProduct[];
  changes: ChangeOut[];
  categories: CategoryCount[];
  step: StepKind;
  onOpen: (id: string, trigger?: Element | null) => void;
}

interface Size {
  width: number;
  height: number;
  narrow: boolean;
}

interface Tip {
  id: string;
  touch: boolean;
  x: number;
  y: number;
}

const NARROW_BELOW = 560;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function coarsePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

// Legend rows per step.
function Legend({ step }: { step: StepKind }) {
  if (step === "grid") {
    return (
      <span className="lg">
        <i className="kd n" />
        One product
      </span>
    );
  }
  if (step === "swarm") {
    return (
      <>
        <span className="lg">
          <i className="kd m" />
          Up
        </span>
        <span className="lg">
          <i className="kd l" />
          Down
        </span>
        <span className="lg">One dot per product</span>
      </>
    );
  }
  if (step === "shrinks" || step === "grows") {
    return (
      <>
        <span className="lg">
          <i className="sw" />
          Label before
        </span>
        <span className="lg">
          <i className="sw f" />
          Label after
        </span>
        <span className="lg">Box height is the quantity read from the label</span>
      </>
    );
  }
  return (
    <>
      <span className="lg">
        <i className="kd m" />
        Price per unit up
      </span>
      <span className="lg">
        <i className="kd l" />
        Price per unit down
      </span>
      <span className="lg">
        <i className="kd n" />
        No change
      </span>
    </>
  );
}

export function Graphic({ story, products, changes, categories, step, onOpen }: GraphicProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<GraphicRenderer | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [layouts, setLayouts] = useState<{ grid: GridLayout; swarm: SwarmLayout } | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [live, setLive] = useState("");
  const touch = useMemo(coarsePointer, []);

  const changeById = useMemo(() => {
    const map = new Map<string, ChangeOut>();
    for (const change of changes) map.set(change.product.id, change);
    return map;
  }, [changes]);
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const dots = useMemo<DotInput[]>(
    () =>
      products.map((product) => {
        const change = changeById.get(product.id);
        const dir = change ? direction(change) : kindDirection(product.change);
        const kind = change?.kind ?? product.change;
        return {
          id: product.id,
          direction: dir === "flat" ? null : dir,
          sizeKind: kind === "shrink" || kind === "shrink_price_cut" ? "shrink" : kind === "grow" ? "grow" : null,
        };
      }),
    [products, changeById],
  );

  const pctOf = useCallback(
    (id: string) => {
      const change = changeById.get(id);
      return change ? (toNumber(change.unit_price_change_pct) ?? toNumber(change.price_change_pct)) : null;
    },
    [changeById],
  );

  // Category rows, largest first; inside a row the changed products come first so they
  // cluster at the start of the block when they light up.
  const gridCategories = useMemo<GridCategory[]>(() => {
    const rank = (dot: DotInput) => (!dot.direction ? 2 : dot.direction === "more" ? 0 : 1);
    const byCategory = new Map<string, DotInput[]>();
    for (const dot of dots) {
      const category = productById.get(dot.id)!.category;
      const list = byCategory.get(category);
      if (list) list.push(dot);
      else byCategory.set(category, [dot]);
    }
    const counts = new Map(categories.map((entry) => [entry.category, entry]));
    return [...byCategory.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([category, list]) => ({
        category,
        changes: counts.get(category)?.changes ?? list.filter((dot) => dot.direction).length,
        ids: list
          .sort((a, b) => {
            const ra = rank(a);
            const rb = rank(b);
            if (ra !== rb) return ra - rb;
            if (ra === 0) return (pctOf(b.id) ?? 0) - (pctOf(a.id) ?? 0);
            if (ra === 1) return (pctOf(a.id) ?? 0) - (pctOf(b.id) ?? 0);
            return productById.get(a.id)!.name.localeCompare(productById.get(b.id)!.name);
          })
          .map((dot) => dot.id),
      }));
  }, [dots, categories, productById, pctOf]);

  const swarmDots = useMemo(
    () =>
      dots
        .filter((dot) => dot.direction)
        .map((dot) => ({ id: dot.id, value: pctOf(dot.id) ?? 0 })),
    [dots, pctOf],
  );

  // Keyboard order for the current step.
  const order = useMemo(() => {
    const gridOrder = gridCategories.flatMap((entry) => entry.ids);
    if (step === "grid" || step === "end") return gridOrder;
    if (step === "changed") return gridOrder.filter((id) => changeById.has(id) || productById.get(id)?.change);
    if (step === "swarm") return [...swarmDots].sort((a, b) => a.value - b.value).map((dot) => dot.id);
    if (step === "shrinks") return story.shrinks.map((item) => item.id);
    return story.grows.map((item) => item.id);
  }, [step, gridCategories, changeById, productById, swarmDots, story]);

  // Renderer lifetime.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let renderer: GraphicRenderer;
    try {
      renderer = new GraphicRenderer(canvas, dots, reducedMotion());
    } catch {
      return undefined;
    }
    rendererRef.current = renderer;
    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [dots]);

  // Stage size.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const measure = () => {
      const rect = stage.getBoundingClientRect();
      const width = Math.max(200, Math.round(rect.width));
      const height = Math.max(200, Math.round(rect.height));
      setSize((current) =>
        current && current.width === width && current.height === height
          ? current
          : { width, height, narrow: width < NARROW_BELOW },
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // Layouts for the size, then card dot positions once the cards have laid out in that size.
  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    const stage = stageRef.current;
    if (!size || !renderer || !stage) return;
    const grid = layoutGrid(gridCategories, size);
    const swarm = layoutSwarm(swarmDots, size);
    setLayouts({ grid, swarm });
    const cards = new Map<string, { x: number; y: number }>();
    const stageRect = stage.getBoundingClientRect();
    cardsRef.current?.querySelectorAll<HTMLElement>("[data-dot]").forEach((element) => {
      const rect = element.getBoundingClientRect();
      cards.set(element.dataset.dot!, {
        x: rect.left - stageRect.left + rect.width / 2,
        y: rect.top - stageRect.top + rect.height / 2,
      });
    });
    const geometry: Geometry = {
      ...size,
      dpr: Math.min(3, window.devicePixelRatio || 1),
      grid,
      swarm,
      cards,
    };
    renderer.setGeometry(geometry);
  }, [size, gridCategories, swarmDots]);

  // Step changes.
  useEffect(() => {
    rendererRef.current?.go(step);
    setTip(null);
    setHighlight(null);
    rendererRef.current?.setHover(null);
    rendererRef.current?.setHighlight(null);
  }, [step]);

  // Pause offscreen.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) rendererRef.current?.setVisible(entry.isIntersecting);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // Fonts change label widths, not dot positions, but a late font swap can shift the cards.
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts?.ready) return;
    void document.fonts.ready.then(() => {
      setSize((current) => (current ? { ...current } : current));
    });
  }, []);

  const showTip = useCallback((id: string, isTouch: boolean) => {
    const renderer = rendererRef.current;
    const position = renderer?.positionOf(id);
    if (!renderer || !position) return;
    renderer.setHover(id);
    setTip({ id, touch: isTouch, x: position.x, y: position.y });
  }, []);

  const hideTip = useCallback(() => {
    rendererRef.current?.setHover(null);
    setTip(null);
  }, []);

  function localPoint(event: { clientX: number; clientY: number }): [number, number] {
    const rect = stageRef.current?.getBoundingClientRect();
    return rect ? [event.clientX - rect.left, event.clientY - rect.top] : [0, 0];
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.pointerType !== "mouse") return;
    const id = rendererRef.current?.pick(...localPoint(event), false) ?? null;
    event.currentTarget.style.cursor = id ? "pointer" : "";
    if (id) {
      if (id !== tip?.id) showTip(id, false);
    } else if (tip && !tip.touch) {
      hideTip();
    }
  }

  function onPointerLeave(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.pointerType === "mouse") hideTip();
  }

  function onClick(event: React.MouseEvent<HTMLCanvasElement>) {
    const id = rendererRef.current?.pick(...localPoint(event), touch) ?? null;
    if (!id) {
      hideTip();
      return;
    }
    if (touch) {
      // The first tap names the product, a second tap on the same dot opens it.
      if (tip?.id === id) onOpen(id, event.currentTarget);
      else showTip(id, true);
      return;
    }
    onOpen(id, event.currentTarget);
  }

  function announce(id: string, index: number) {
    const product = productById.get(id);
    if (!product) return;
    const change = changeById.get(id);
    const parts = [displayName(product.name), quoted(product.size ?? ""), formatMoney(product.price) ?? "no price"];
    if (change) {
      const pct = formatPercent(change.unit_price_change_pct ?? change.price_change_pct);
      const unit = change.after?.unit_price?.unit;
      parts.push(`${kindLabel(change.kind)}${pct ? `, ${pct}${unit ? ` per ${unitWord(unit)}` : ""}` : ""}`);
    } else {
      parts.push("no change recorded");
    }
    setLive(`${parts.join(", ")}. ${index + 1} of ${formatInt(order.length)}.`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLCanvasElement>) {
    if (order.length === 0) return;
    const current = highlight ? order.indexOf(highlight) : -1;
    let next: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = Math.min(order.length - 1, current + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = Math.max(0, current <= 0 ? 0 : current - 1);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = order.length - 1;
        break;
      case "Enter":
      case " ":
        if (highlight) {
          event.preventDefault();
          onOpen(highlight, event.currentTarget);
        }
        return;
      case "Escape":
        setHighlight(null);
        rendererRef.current?.setHighlight(null);
        hideTip();
        setLive("");
        return;
      default:
        return;
    }
    event.preventDefault();
    const id = order[next]!;
    setHighlight(id);
    rendererRef.current?.setHighlight(id);
    showTip(id, false);
    announce(id, next);
  }

  const tipProduct = tip ? productById.get(tip.id) : null;
  const tipChange = tip ? changeById.get(tip.id) : undefined;
  const narrow = size?.narrow ?? false;

  return (
    <figure className="sticky" aria-label={`Chart of ${formatInt(products.length)} tracked products and their recorded changes`}>
      <figcaption className="g-head">
        <div className="swap" key={`${step}-${story.steps.find((s) => s.kind === step)?.title ?? ""}`}>
          <p className="g-title">{story.steps.find((s) => s.kind === step)?.title ?? ""}</p>
          <div className="g-legend">
            <Legend step={step} />
          </div>
        </div>
      </figcaption>
      <div className={`g-stage${narrow ? " narrow" : ""}`} ref={stageRef}>
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="group"
          aria-label="Product dots. Use the arrow keys to move between products and Enter to open one."
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          onClick={onClick}
          onKeyDown={onKeyDown}
          onBlur={() => {
            setHighlight(null);
            rendererRef.current?.setHighlight(null);
            if (tip && !tip.touch) hideTip();
          }}
        />
        {size && layouts ? <Overlay size={size} layouts={layouts} story={story} step={step} /> : null}
        <SizeCards ref={cardsRef} shrinks={story.shrinks} grows={story.grows} step={step} />
        {tip && tipProduct ? (
          <TipBox
            tip={tip}
            product={tipProduct}
            change={tipChange}
            stage={size}
            onOpen={(trigger) => onOpen(tip.id, trigger)}
          />
        ) : null}
        <div className="sr-only" aria-live="polite">
          {live}
        </div>
      </div>
      <p className="g-source">{story.source}</p>
    </figure>
  );
}

function TipBox({
  tip,
  product,
  change,
  stage,
  onOpen,
}: {
  tip: Tip;
  product: FieldProduct;
  change: ChangeOut | undefined;
  stage: Size | null;
  onOpen: (trigger: Element | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !stage) return;
    const w = element.offsetWidth;
    const h = element.offsetHeight;
    let x = tip.x + 14;
    let y = tip.y - h - 10;
    if (x + w > stage.width) x = tip.x - w - 14;
    if (x < 0) x = Math.max(0, Math.min(stage.width - w, tip.x - w / 2));
    if (y < 0) y = tip.y + 14;
    setPos({ x: Math.round(x), y: Math.round(y) });
  }, [tip, stage]);
  const dir = change ? direction(change) : kindDirection(product.change);
  const pct = change ? formatPercent(change.unit_price_change_pct ?? change.price_change_pct) : null;
  const unit = change?.after?.unit_price?.unit;
  return (
    <div
      ref={ref}
      className={`tip on${tip.touch ? " touch" : ""}`}
      role="status"
      style={{ transform: pos ? `translate(${pos.x}px, ${pos.y}px)` : undefined, visibility: pos ? "visible" : "hidden" }}
    >
      <b>{displayName(product.name)}</b>
      <span>
        {quoted(product.size ?? "")}, {formatMoney(product.price) ?? "no price"}
      </span>
      {change || product.change ? (
        <span className="tt-k">
          <i className={`kd ${dir === "more" ? "m" : "l"}`} aria-hidden="true" />
          {kindLabel(change?.kind ?? product.change ?? "")}
          {pct ? `, ${pct}${unit ? ` per ${unitWord(unit)}` : ""}` : ""}
        </span>
      ) : (
        <span className="tt-k">No change recorded</span>
      )}
      {tip.touch ? (
        <button type="button" className="tt-open" onClick={(event) => onOpen(event.currentTarget)}>
          Open history
        </button>
      ) : null}
    </div>
  );
}

function Overlay({
  size,
  layouts,
  story,
  step,
}: {
  size: Size;
  layouts: { grid: GridLayout; swarm: SwarmLayout };
  story: Story;
  step: StepKind;
}) {
  const { grid, swarm } = layouts;
  const narrow = size.narrow;
  const fs = narrow ? 11 : undefined;
  const axisY = swarm.maxY + (narrow ? 16 : 26);
  const labelY = axisY + (narrow ? 40 : 46);
  const tickText = (v: number) => (v === 0 ? "0" : formatPercent(v, 0)!);

  // Annotation labels: the largest decrease prefers to read to the right of its dot and the
  // largest increase to the left. A label that would leave the stage or overlap the other
  // flips to the other side; if neither side is free it is lifted above the first.
  interface Placed {
    key: string;
    x: number;
    y: number;
    anchor: "start" | "end";
    textX: number;
    top: number;
    rows: string[];
    x0: number;
    x1: number;
  }
  const annotations: Placed[] = [];
  const charW = narrow ? 5.6 : 6.6;
  const rowH = narrow ? 13 : 16;
  const gap = narrow ? 4 : 6;
  const annTop = swarm.minY - (narrow ? 40 : 64);
  const candidates = [story.annotations.down, story.annotations.up]
    .map((a, i) =>
      a && swarm.positions.get(a.id) ? { a, p: swarm.positions.get(a.id)!, prefer: i === 0 ? ("start" as const) : ("end" as const) } : null,
    )
    .filter((c): c is NonNullable<typeof c> => c !== null);
  for (const c of candidates) {
    const rows = narrow ? [shortName(c.a.short, 22), ...c.a.line.split(", ")] : [c.a.short, c.a.line];
    const w = Math.max(...rows.map((row) => row.length)) * charW;
    const boxFor = (anchor: "start" | "end") => {
      const x0 = anchor === "start" ? c.p.x + gap : c.p.x - gap - w;
      return { anchor, x0, x1: x0 + w };
    };
    const order: ("start" | "end")[] = c.prefer === "start" ? ["start", "end"] : ["end", "start"];
    const free = order
      .map(boxFor)
      .find(
        (box) =>
          box.x0 >= -4 &&
          box.x1 <= size.width + 10 &&
          !annotations.some((other) => other.top === annTop && box.x0 < other.x1 + 12 && box.x1 > other.x0 - 12),
      );
    const box = free ?? boxFor(c.prefer);
    const top = free ? annTop : Math.min(...annotations.map((a) => a.top)) - rows.length * rowH - 6;
    annotations.push({
      key: c.a.id,
      x: c.p.x,
      y: c.p.y,
      anchor: box.anchor,
      textX: box.anchor === "start" ? box.x0 : box.x1,
      top,
      rows,
      x0: box.x0,
      x1: box.x1,
    });
  }

  const offZones = [swarm.left, swarm.right].filter((zone): zone is NonNullable<typeof zone> => zone !== null);
  const offCount = story.offScale.length;
  const offLabel = offCount
    ? story.offScale.every((a) => story.shrinks.some((s) => s.id === a.id))
      ? "listed size went down"
      : "listed size changed"
    : "";

  return (
    <svg className="g-svg" viewBox={`0 0 ${size.width} ${size.height}`} data-step={step} aria-hidden="true">
      <g className="ly ly-grid">
        {grid.labels.map((label) =>
          label.above ? (
            <text key={label.name} className="t-cat" x={0} y={label.y} fontSize={11}>
              {label.name} <tspan className="t-n">{formatInt(label.count)}</tspan>
            </text>
          ) : (
            <g key={label.name}>
              <text className="t-cat" x={0} y={label.y} dy="0.35em">
                {label.name}
              </text>
              <text className="t-n" x={label.countX} y={label.y} dy="0.35em" textAnchor="end">
                {formatInt(label.count)}
              </text>
            </g>
          ),
        )}
      </g>
      {!narrow ? (
        <g className="ly ly-cnt">
          {grid.labels
            .filter((label) => label.changes > 0)
            .map((label) => (
              <text key={label.name} className="t-cnt t-halo" x={label.changeX} y={label.y} dy="0.35em">
                {label.changes}
              </text>
            ))}
        </g>
      ) : null}
      <g className="ly ly-axis">
        <line className="s-zero" x1={swarm.sx(0)} x2={swarm.sx(0)} y1={swarm.minY - (narrow ? 8 : 14)} y2={axisY} />
        <line className="s-axis" x1={swarm.x0} x2={swarm.x1} y1={axisY} y2={axisY} />
        {swarm.ticks.map((v) => {
          const x = swarm.sx(v);
          const edge = narrow && (v === swarm.ticks[0] || v === swarm.ticks[swarm.ticks.length - 1]);
          return (
            <g key={v}>
              <line className="s-tick" x1={x} x2={x} y1={axisY} y2={axisY + 5} />
              <text
                className="t-tick"
                x={x}
                y={axisY + 19}
                fontSize={fs}
                textAnchor={edge ? (v < 0 ? "start" : "end") : "middle"}
              >
                {tickText(v)}
              </text>
            </g>
          );
        })}
        {offZones.map((zone) => {
          const isRight = zone === swarm.right;
          const bx = isRight ? swarm.x1 + (narrow ? 9 : 16) : swarm.x0 - (narrow ? 9 : 16);
          return (
            <g key={isRight ? "right" : "left"}>
              <line
                className="s-axis"
                x1={isRight ? bx + 6 : zone.x0}
                x2={isRight ? zone.x1 : bx - 6}
                y1={axisY}
                y2={axisY}
              />
              <path
                className="s-axis"
                d={`M${bx - 4},${axisY + 5} L${bx + 1},${axisY - 5} M${bx + 2},${axisY + 5} L${bx + 7},${axisY - 5}`}
                fill="none"
              />
              {zone.columns.map((column, i) => (
                <g key={i}>
                  <line className="s-tick" x1={column.x} x2={column.x} y1={axisY} y2={axisY + 5} />
                  <text
                    className="t-tick"
                    x={column.x}
                    y={axisY + 19}
                    fontSize={fs}
                    textAnchor={narrow && i === zone.columns.length - 1 && isRight ? "end" : "middle"}
                  >
                    {formatPercent(column.value, 0)}
                  </text>
                </g>
              ))}
            </g>
          );
        })}
        <text className="t-axl" x={swarm.sx(0) - 10} y={labelY} textAnchor="end" fontSize={fs}>
          {"← Costs you less"}
        </text>
        <text className="t-axl" x={swarm.sx(0) + 10} y={labelY} fontSize={fs}>
          {"Costs you more →"}
        </text>
      </g>
      <g className="ly ly-ann">
        {annotations.map((a) => (
          <g key={a.key}>
            <line className="s-lead" x1={a.x} x2={a.x} y1={a.y - swarm.r - 3} y2={a.top + 8} />
            <line className="s-lead" x1={a.x} x2={a.textX} y1={a.top + 8} y2={a.top + 8} />
            {a.rows.map((row, i) => (
              <text
                key={i}
                className={i === 0 ? "t-ann-b" : "t-ann"}
                x={a.textX}
                y={a.top - (a.rows.length - 1 - i) * rowH}
                textAnchor={a.anchor}
                fontSize={fs}
              >
                {row}
              </text>
            ))}
          </g>
        ))}
        {swarm.right && offCount ? (
          <>
            <text className="t-ann-b" x={swarm.right.x1} y={swarm.cy - (narrow ? 34 : 46)} textAnchor="end" fontSize={fs}>
              {offCount} off the scale
            </text>
            <text className="t-ann" x={swarm.right.x1} y={swarm.cy - (narrow ? 21 : 29)} textAnchor="end" fontSize={fs}>
              {offLabel}
            </text>
          </>
        ) : null}
        {swarm.left && !swarm.right && offCount ? (
          <>
            <text className="t-ann-b" x={swarm.left.x0} y={swarm.cy - (narrow ? 34 : 46)} fontSize={fs}>
              {offCount} off the scale
            </text>
            <text className="t-ann" x={swarm.left.x0} y={swarm.cy - (narrow ? 21 : 29)} fontSize={fs}>
              {offLabel}
            </text>
          </>
        ) : null}
      </g>
    </svg>
  );
}
