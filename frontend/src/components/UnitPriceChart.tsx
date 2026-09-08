import { useMemo, useRef, useState, type MouseEvent, type TouchEvent } from "react";
import type { SnapshotOut } from "../api/types";
import { formatDate, formatMoney, formatUnitPrice, toNumber } from "../lib/format";

interface Segment {
  x0: number;
  x1: number;
  y: number;
  unit: string;
  snapshot: SnapshotOut;
}

const W = 720;
const H = 200;
const TOP = 14;
const BOTTOM = 32;
const RIGHT = 16;
const DAY = 86_400_000;
const CHAR = 7.2;

function buildSegments(snapshots: SnapshotOut[]): Segment[] {
  const segments: Segment[] = [];
  for (const snapshot of snapshots) {
    const y = toNumber(snapshot.unit_price?.value);
    const unit = snapshot.unit_price?.unit;
    const x0 = new Date(snapshot.first_seen_at).getTime();
    const x1 = new Date(snapshot.last_seen_at).getTime();
    if (y === null || !unit || Number.isNaN(x0) || Number.isNaN(x1)) continue;
    segments.push({ x0, x1: Math.max(x0, x1), y, unit, snapshot });
  }
  return segments.sort((a, b) => a.x0 - b.x0);
}

function dateOf(ms: number): string {
  return formatDate(new Date(ms).toISOString()) ?? "";
}

// Step line of unit price over time. Each state holds until the next one is first observed.
// Renders nothing with fewer than two priced snapshots; the caller shows a note instead.
export function UnitPriceChart({ snapshots }: { snapshots: SnapshotOut[] }) {
  const segments = useMemo(() => buildSegments(snapshots), [snapshots]);
  const [hover, setHover] = useState<{ index: number; x: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  if (segments.length < 2) return null;

  const firstSeg = segments[0]!;
  const lastSeg = segments[segments.length - 1]!;
  const unit = firstSeg.unit;
  const xMin = firstSeg.x0;
  const xMax = Math.max(lastSeg.x1, lastSeg.x0 + DAY, xMin + DAY);
  const ys = segments.map((s) => s.y);
  let yLo = Math.min(...ys);
  let yHi = Math.max(...ys);
  if (yLo === yHi) {
    yLo *= 0.95;
    yHi *= 1.05;
  } else {
    const pad = (yHi - yLo) * 0.18;
    yLo = Math.max(0, yLo - pad);
    yHi += pad;
  }

  const distinct = Array.from(new Set(ys)).sort((a, b) => a - b);
  const levels = distinct.length <= 5 ? distinct : [distinct[0]!, distinct[distinct.length - 1]!];
  const labels = levels.map((v) => formatUnitPrice(v, unit) ?? "");
  const LEFT = Math.ceil(Math.max(...labels.map((l) => l.length)) * CHAR + 16);
  const plotW = W - LEFT - RIGHT;
  const plotH = H - TOP - BOTTOM;
  const sx = (t: number) => LEFT + ((t - xMin) / (xMax - xMin)) * plotW;
  const sy = (v: number) => TOP + (1 - (v - yLo) / (yHi - yLo)) * plotH;

  // Drop a level label when it would overlap the previous one.
  const shown: number[] = [];
  let lastY = Number.POSITIVE_INFINITY;
  for (const v of [...levels].reverse()) {
    if (lastY - sy(v) >= 14 || !Number.isFinite(lastY)) {
      shown.push(v);
      lastY = sy(v);
    }
  }

  let path = `M${sx(firstSeg.x0).toFixed(1)},${sy(firstSeg.y).toFixed(1)}`;
  for (const seg of segments.slice(1)) {
    path += ` H${sx(seg.x0).toFixed(1)} V${sy(seg.y).toFixed(1)}`;
  }
  path += ` H${sx(xMax).toFixed(1)}`;

  const active = hover ? segments[hover.index]! : lastSeg;
  const activeX = hover ? hover.x : sx(xMax);
  const isLast = active === lastSeg;
  const range = isLast
    ? `seen since ${dateOf(active.x0)}`
    : active.x1 - active.x0 < DAY
      ? `seen ${dateOf(active.x0)}`
      : `seen ${dateOf(active.x0)} to ${dateOf(active.x1)}`;

  function locate(clientX: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const px = ((clientX - rect.left) / rect.width) * W;
    const clamped = Math.min(Math.max(px, sx(xMin)), sx(xMax));
    const t = xMin + ((clamped - LEFT) / plotW) * (xMax - xMin);
    let index = 0;
    segments.forEach((seg, i) => {
      if (seg.x0 <= t) index = i;
    });
    setHover({ index, x: clamped });
  }

  const onMouseMove = (event: MouseEvent<SVGSVGElement>) => locate(event.clientX);
  const onTouch = (event: TouchEvent<SVGSVGElement>) => {
    const touch = event.touches[0];
    if (touch) locate(touch.clientX);
  };

  const label =
    `Unit price over time, from ${formatUnitPrice(firstSeg.y, unit)} on ${dateOf(firstSeg.x0)} ` +
    `to ${formatUnitPrice(lastSeg.y, unit)} on ${dateOf(lastSeg.x1)}.`;

  return (
    <div className="chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
        onTouchStart={onTouch}
        onTouchMove={onTouch}
      >
        {levels.map((v) => (
          <line key={v} className="grid" x1={LEFT} x2={W - RIGHT} y1={sy(v)} y2={sy(v)} />
        ))}
        {shown.map((v) => (
          <text key={v} x={LEFT - 10} y={sy(v) + 4} textAnchor="end">
            {formatUnitPrice(v, unit)}
          </text>
        ))}
        <line className="axis" x1={LEFT} x2={W - RIGHT} y1={TOP + plotH} y2={TOP + plotH} />
        {segments.slice(1).map((seg) => (
          <line
            key={seg.snapshot.id}
            className="axis"
            x1={sx(seg.x0)}
            x2={sx(seg.x0)}
            y1={TOP + plotH}
            y2={TOP + plotH + 5}
          />
        ))}
        <text x={LEFT} y={H - 8} textAnchor="start">
          {dateOf(xMin)}
        </text>
        <text x={W - RIGHT} y={H - 8} textAnchor="end">
          {dateOf(lastSeg.x1)}
        </text>
        <path className="line" d={path} />
        <line className="crosshair" x1={activeX} x2={activeX} y1={TOP} y2={TOP + plotH} />
        <circle className="marker" cx={activeX} cy={sy(active.y)} r={4} />
        <rect className="hit" x={LEFT} y={TOP} width={plotW} height={plotH} />
      </svg>
      <p className="chart-note">
        <b>{formatUnitPrice(active.y, unit)}</b> · {active.snapshot.size_text} at{" "}
        {formatMoney(active.snapshot.price_regular) ?? "no price"} · {range}
      </p>
    </div>
  );
}
