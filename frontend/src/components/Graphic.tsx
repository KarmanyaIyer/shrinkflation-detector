import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { CategoryCount, ChangeOut, FieldProduct } from "../api/types";
import { latestByProduct, unitChangePct } from "../lib/changes";
import { layoutSwarmChart, type SwarmChart, type TextMeasure } from "../lib/chartLayout";
import { formatInt, formatMoney, formatPercent, quoted, unitWord } from "../lib/format";
import { layoutGrid, type GridCategory, type GridLayout } from "../lib/grid";
import { direction, kindDirection, kindLabel } from "../lib/kinds";
import type { Story, StepKind } from "../lib/story";
import { coarsePointer } from "../lib/layout";
import { displayName } from "../lib/text";
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
  // A short stage: the swarm sits under its labels and the size cards show one group at a time.
  compact: boolean;
}

interface Tip {
  id: string;
  touch: boolean;
  x: number;
  y: number;
}

interface Layouts {
  grid: GridLayout;
  chart: SwarmChart;
}

const NARROW_BELOW = 560;
const SHORT_BELOW = 480;
const SANS = '"Public Sans", "Helvetica Neue", Arial, sans-serif';

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Measures text with the page's own font through a canvas. Without a canvas (tests), it falls
// back to an average glyph width. One pixel is added so tabular figures, which the canvas does
// not apply, never make a label wider than measured.
function textMeasure(): TextMeasure {
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = document.createElement("canvas").getContext("2d");
  } catch {
    ctx = null;
  }
  return (text, px, weight) => {
    if (!ctx) return text.length * px * (weight >= 600 ? 0.6 : 0.55);
    ctx.font = `${weight} ${px}px ${SANS}`;
    return Math.ceil(ctx.measureText(text).width) + 1;
  };
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
  const stepRef = useRef(step);
  const [size, setSize] = useState<Size | null>(null);
  const [layouts, setLayouts] = useState<Layouts | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [live, setLive] = useState("");
  // The stage size at which the wide size cards were found taller than the stage; at that size
  // the cards use the compact rows instead.
  const [cardsOverflow, setCardsOverflow] = useState<string | null>(null);
  const touch = useMemo(coarsePointer, []);
  const sizeKey = size ? `${size.width}x${size.height}` : "";
  const compactCards = size !== null && (size.compact || cardsOverflow === sizeKey);

  // A product's newest change decides its dot, color, tooltip, and announcement.
  const changeById = useMemo(() => latestByProduct(changes), [changes]);
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const sizeKindById = useMemo(() => {
    const map = new Map<string, "shrink" | "grow">();
    for (const item of story.grows) map.set(item.id, "grow");
    for (const item of story.shrinks) map.set(item.id, "shrink");
    return map;
  }, [story]);

  const dots = useMemo<DotInput[]>(
    () =>
      products.map((product) => {
        const change = changeById.get(product.id);
        const dir = change ? direction(change) : kindDirection(product.change);
        return { id: product.id, direction: dir === "flat" ? null : dir, sizeKind: sizeKindById.get(product.id) ?? null };
      }),
    [products, changeById, sizeKindById],
  );

  const pctOf = useCallback(
    (id: string) => {
      const change = changeById.get(id);
      return change ? unitChangePct(change) : null;
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

  // Renderer lifetime. A layout effect declared before the geometry effect, so a renderer
  // rebuilt for new dots gets its geometry in the same commit, and it starts at the current step.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let renderer: GraphicRenderer;
    try {
      renderer = new GraphicRenderer(canvas, dots, reducedMotion(), stepRef.current);
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
      const narrow = width < NARROW_BELOW;
      setSize((current) =>
        current && current.width === width && current.height === height
          ? current
          : { width, height, narrow, compact: narrow || height < SHORT_BELOW },
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const measureText = useMemo(textMeasure, []);
  const offText = useMemo(
    () =>
      story.offScale.length && story.offScale.every((a) => story.shrinks.some((s) => s.id === a.id))
        ? "listed size went down"
        : "listed size changed",
    [story],
  );

  // Layouts for the size, then card dot positions once the cards have laid out in that size.
  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    const stage = stageRef.current;
    if (!size || !stage) return;
    const grid = layoutGrid(gridCategories, size);
    const chart = layoutSwarmChart(
      {
        dots: swarmDots,
        width: size.width,
        height: size.height,
        narrow: size.narrow,
        compact: size.compact,
        down: story.annotations.down,
        up: story.annotations.up,
        offCount: story.offScale.length,
        offText,
      },
      measureText,
    );
    setLayouts({ grid, chart });
    if (!renderer) return;
    const stageRect = stage.getBoundingClientRect();
    const cardGrid = cardsRef.current?.querySelector(".sc-grid");
    if (!compactCards && cardGrid && cardGrid.getBoundingClientRect().height > stageRect.height) {
      setCardsOverflow(sizeKey);
      return;
    }
    const cards = new Map<string, { x: number; y: number }>();
    cardsRef.current?.querySelectorAll<HTMLElement>("[data-dot]").forEach((element) => {
      const id = element.dataset.dot!;
      if (element.dataset.kind !== sizeKindById.get(id)) return;
      const rect = element.getBoundingClientRect();
      cards.set(id, {
        x: rect.left - stageRect.left + rect.width / 2,
        y: rect.top - stageRect.top + rect.height / 2,
      });
    });
    const geometry: Geometry = {
      width: size.width,
      height: size.height,
      narrow: size.narrow,
      compactCards,
      dpr: Math.min(3, window.devicePixelRatio || 1),
      grid,
      swarm: chart.swarm,
      cards,
    };
    renderer.setGeometry(geometry);
  }, [size, sizeKey, compactCards, dots, gridCategories, swarmDots, story, offText, measureText, sizeKindById]);

  // Step changes.
  useEffect(() => {
    stepRef.current = step;
    const renderer = rendererRef.current;
    if (renderer && renderer.currentStep !== step) renderer.go(step);
    setTip(null);
    setHighlight(null);
    renderer?.setHover(null);
    renderer?.setHighlight(null);
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

  // Label widths are measured with the web font, so measure again once it has loaded. A late
  // font swap can also move the size cards.
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts?.ready) return;
    let live = true;
    void document.fonts.ready.then(() => {
      if (live) setSize((current) => (current ? { ...current } : current));
    });
    return () => {
      live = false;
    };
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
      const pct = formatPercent(unitChangePct(change));
      const unit = change.after?.unit_price?.unit;
      parts.push(`${kindLabel(change.kind)}${pct ? `, ${pct}${unit ? ` per ${unitWord(unit)}` : ""}` : ""}`);
    } else {
      parts.push("no change recorded");
    }
    setLive(`${parts.join(", ")}. ${formatInt(index + 1)} of ${formatInt(order.length)}.`);
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
  const title = story.steps.find((s) => s.kind === step)?.title ?? "";

  return (
    <figure className="sticky" aria-label={`Chart of ${formatInt(products.length)} tracked products and their recorded changes`}>
      <figcaption className="g-head">
        <div className="swap" key={`${step}-${title}`}>
          <p className="g-title">{title}</p>
          <div className="g-legend">
            <Legend step={step} />
          </div>
        </div>
      </figcaption>
      <div className={`g-stage${narrow ? " narrow" : ""}`} ref={stageRef}>
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
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
        {size && layouts ? <Overlay size={size} layouts={layouts} step={step} /> : null}
        <SizeCards ref={cardsRef} shrinks={story.shrinks} grows={story.grows} step={step} compact={compactCards} />
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
  const pct = change ? formatPercent(unitChangePct(change)) : null;
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

function Overlay({ size, layouts, step }: { size: Size; layouts: Layouts; step: StepKind }) {
  const { grid, chart } = layouts;
  const { swarm, axisY } = chart;
  const narrow = size.narrow;
  const offZones = [swarm.left, swarm.right].filter((zone): zone is NonNullable<typeof zone> => zone !== null);

  return (
    <svg className="g-svg" viewBox={`0 0 ${size.width} ${size.height}`} data-step={step} aria-hidden="true">
      <g className="ly ly-grid">
        {grid.labels.map((label) =>
          label.above ? (
            <text key={label.name} className="t-cat" x={0} y={label.y}>
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
        <line className="s-zero" x1={swarm.sx(0)} x2={swarm.sx(0)} y1={chart.zeroTop} y2={axisY} />
        <line className="s-axis" x1={swarm.x0} x2={swarm.x1} y1={axisY} y2={axisY} />
        {swarm.ticks.map((v) => (
          <line key={v} className="s-tick" x1={swarm.sx(v)} x2={swarm.sx(v)} y1={axisY} y2={axisY + 5} />
        ))}
        {chart.ticks.map((tick) => (
          <text key={tick.text} className="t-tick" x={tick.x} y={tick.y} textAnchor={tick.anchor}>
            {tick.text}
          </text>
        ))}
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
                <line key={i} className="s-tick" x1={column.x} x2={column.x} y1={axisY} y2={axisY + 5} />
              ))}
            </g>
          );
        })}
        {chart.offTicks.map((tick, i) => (
          <text key={i} className="t-tick" x={tick.x} y={tick.y} textAnchor={tick.anchor}>
            {tick.text}
          </text>
        ))}
        {chart.captions.map((caption) => (
          <text key={caption.text} className="t-axl" x={caption.x} y={caption.y} textAnchor={caption.anchor}>
            {caption.text}
          </text>
        ))}
      </g>
      <g className="ly ly-ann">
        {chart.annotations.map((a) => (
          <g key={a.id}>
            <line className="s-lead" x1={a.x} x2={a.x} y1={a.y - swarm.r - 3} y2={a.leaderY} />
            <line className="s-lead" x1={a.x} x2={a.textX} y1={a.leaderY} y2={a.leaderY} />
            {a.rows.map((row, i) => (
              <text
                key={i}
                className={row.bold ? "t-ann-b" : "t-ann"}
                x={a.textX}
                y={a.base - (a.rows.length - 1 - i) * chart.rowH}
                textAnchor={a.anchor}
              >
                {row.text}
              </text>
            ))}
          </g>
        ))}
        {chart.offLabel
          ? chart.offLabel.rows.map((row, i, rows) => (
              <text
                key={i}
                className={row.bold ? "t-ann-b" : "t-ann"}
                x={chart.offLabel!.x}
                y={chart.offLabel!.base - (rows.length - 1 - i) * chart.rowH}
                textAnchor={chart.offLabel!.anchor}
              >
                {row.text}
              </text>
            ))
          : null}
      </g>
    </svg>
  );
}
