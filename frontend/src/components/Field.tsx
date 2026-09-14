import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { FieldProduct } from "../api/types";
import { formatInt, formatMoney } from "../lib/format";
import { kindLabel, kindTone } from "../lib/kinds";
import { FieldRenderer } from "./fieldRenderer";

interface Tip {
  product: FieldProduct;
  x: number;
  y: number;
}

// Matches the tooltip's max-width in the stylesheet.
const TIP_WIDTH = 240;

const LEGEND = [
  { className: "lg-shrink", label: "shrank" },
  { className: "lg-grow", label: "grew" },
  { className: "lg-up", label: "price up" },
  { className: "lg-down", label: "price down" },
];

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// One square per tracked product, grouped by category. Changed products are colored. Hovering
// names a product, clicking opens it, and the assistant's tool calls light up the products they
// touched.
export function Field({
  products,
  scanning,
  highlight,
}: {
  products: FieldProduct[] | null;
  scanning: boolean;
  highlight: string[];
}) {
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<FieldRenderer | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !products) return undefined;
    let renderer: FieldRenderer;
    try {
      renderer = new FieldRenderer(canvas, products, reducedMotion(), {
        onHover: (index, x, y) => {
          setTip(index >= 0 ? { product: products[index]!, x, y } : null);
        },
        onSelect: (index) => {
          void navigate(`/products/${products[index]!.id}`);
        },
      });
    } catch {
      return undefined;
    }
    rendererRef.current = renderer;
    const layout = () => {
      const width = Math.floor(wrap.getBoundingClientRect().width);
      if (width > 0) setHeight(renderer.resize(width));
    };
    layout();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      let lastWidth = wrap.getBoundingClientRect().width;
      observer = new ResizeObserver(() => {
        const width = wrap.getBoundingClientRect().width;
        if (Math.abs(width - lastWidth) < 1) return;
        lastWidth = width;
        layout();
      });
      observer.observe(wrap);
    }
    return () => {
      observer?.disconnect();
      renderer.destroy();
      rendererRef.current = null;
      setTip(null);
    };
  }, [products, navigate]);

  useEffect(() => {
    rendererRef.current?.setScanning(scanning);
  }, [scanning, products]);

  useEffect(() => {
    rendererRef.current?.setHighlight(highlight);
  }, [highlight, products]);

  const count = products ? formatInt(products.length) : null;
  const wrapWidth = wrapRef.current?.clientWidth ?? 0;

  return (
    <div className="field" ref={wrapRef}>
      <div className="field-head">
        <span className="field-count">{count ? `${count} products` : " "}</span>
        <ul className="legend" aria-label="Colors">
          {LEGEND.map((entry) => (
            <li key={entry.label}>
              <i className={entry.className} aria-hidden="true" /> {entry.label}
            </li>
          ))}
        </ul>
      </div>
      <div className="field-canvas" style={{ minHeight: products ? height : undefined }}>
        {products ? (
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`Map of ${count} tracked products grouped by category. Colored squares changed size or price.`}
          />
        ) : (
          <div className="field-sk" aria-hidden="true" />
        )}
        {tip ? (
          <div
            className="field-tip"
            style={{
              // Slides left near the right edge and sits above the cursor near the bottom, so
              // the box is never squeezed against the card.
              left: Math.max(0, Math.min(tip.x, wrapWidth - TIP_WIDTH)),
              top: tip.y,
              transform: tip.y > height - 96 ? "translate(0, calc(-100% - 12px))" : "translate(0, 14px)",
            }}
          >
            <div className="tip-name">{tip.product.name}</div>
            <div className="tip-meta">
              {[tip.product.size, formatMoney(tip.product.price)].filter(Boolean).join(", ") || tip.product.category}
              {tip.product.change ? (
                <span className={`tip-kind ${kindTone(tip.product.change)}`}>
                  {kindLabel(tip.product.change)}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
