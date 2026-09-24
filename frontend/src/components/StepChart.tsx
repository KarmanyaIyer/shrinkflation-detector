import type { ChangeOut, SnapshotOut } from "../api/types";
import { formatDateShort, formatPercent, formatUnitAmount, toNumber, unitWord } from "../lib/format";

const W = 484;
const H = 190;
const PAD = { top: 34, right: 16, bottom: 26, left: 52 };

interface Segment {
  x0: number;
  x1: number;
  y: number;
  value: number;
  snapshot: SnapshotOut;
}

export interface StepChartProps {
  snapshots: SnapshotOut[];
  changes: ChangeOut[];
}

// Price per unit over the tracked period as a step line: one flat segment per stored state,
// with the change between neighbouring states written above the step. States whose unit
// differs from the latest one (a parse that switched from oz to items) are left out, and
// the caption says so.
export function StepChart({ snapshots, changes }: StepChartProps) {
  const ordered = [...snapshots].sort((a, b) => a.first_seen_at.localeCompare(b.first_seen_at));
  const latest = ordered[ordered.length - 1];
  const unit = latest?.unit_price?.unit ?? null;
  const usable = unit ? ordered.filter((s) => s.unit_price?.unit === unit && toNumber(s.unit_price.value) !== null) : [];
  const skipped = ordered.length - usable.length;

  if (!unit || usable.length === 0) {
    return (
      <p className="dr-nochart">
        No price per unit: the size text {latest ? `“${latest.size_text}”` : ""} could not be parsed into a quantity, so
        only the shelf price is stored.
      </p>
    );
  }

  const t0 = new Date(usable[0]!.first_seen_at).getTime();
  const t1 = Math.max(new Date(usable[usable.length - 1]!.last_seen_at).getTime(), t0 + 1);
  const values = usable.map((s) => toNumber(s.unit_price!.value)!);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi === lo) {
    lo *= 0.9;
    hi *= 1.1;
  } else {
    const pad = (hi - lo) * 0.25;
    lo -= pad;
    hi += pad;
  }
  const sx = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
  const sy = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);

  const segments: Segment[] = usable.map((snapshot, i) => {
    const value = toNumber(snapshot.unit_price!.value)!;
    const start = new Date(snapshot.first_seen_at).getTime();
    const next = usable[i + 1];
    const end = next ? new Date(next.first_seen_at).getTime() : new Date(snapshot.last_seen_at).getTime();
    return { x0: sx(start), x1: sx(Math.max(end, start)), y: sy(value), value, snapshot };
  });

  const path = segments
    .map((seg, i) => (i === 0 ? `M${seg.x0.toFixed(1)},${seg.y.toFixed(1)} ` : `L${seg.x0.toFixed(1)},${seg.y.toFixed(1)} `) + `L${seg.x1.toFixed(1)},${seg.y.toFixed(1)}`)
    .join(" ");

  const changeAt = new Map<number, ChangeOut>();
  for (const change of changes) if (change.after) changeAt.set(change.after.id, change);

  // A step is marked where the price per unit moved or a change was published; a new state
  // with the same price per unit (a promo came or went) draws no marker.
  const steps = segments
    .slice(1)
    .map((seg, i) => {
      const prev = segments[i]!;
      const change = changeAt.get(seg.snapshot.id);
      const pct = change
        ? (toNumber(change.unit_price_change_pct) ?? toNumber(change.price_change_pct))
        : ((seg.value - prev.value) / prev.value) * 100;
      return { x: seg.x0, yFrom: prev.y, yTo: seg.y, pct, key: seg.snapshot.id, marked: !!change || Math.abs(pct ?? 0) >= 0.05 };
    })
    .filter((step) => step.marked);

  const firstLabel = formatDateShort(usable[0]!.first_seen_at) ?? "";
  const lastLabel = formatDateShort(usable[usable.length - 1]!.last_seen_at) ?? "";
  const baseY = H - PAD.bottom + 6;

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Price per ${unitWord(unit)} from ${firstLabel} to ${lastLabel}: ${segments
        .map((seg) => `${formatUnitAmount(seg.value)} from ${formatDateShort(seg.snapshot.first_seen_at)}`)
        .join(", ")}.`}>
        <line className="c-base" x1={PAD.left} x2={W - PAD.right} y1={baseY} y2={baseY} />
        <text className="c-tick" x={PAD.left} y={baseY + 15}>
          {firstLabel}
        </text>
        <text className="c-tick" x={W - PAD.right} y={baseY + 15} textAnchor="end">
          {lastLabel}
        </text>
        <text className="c-tick" x={PAD.left - 8} y={sy(values[0]!)} dy="0.35em" textAnchor="end">
          {formatUnitAmount(values[0]!)}
        </text>
        {values[values.length - 1] !== values[0] ? (
          <text className="c-tick" x={PAD.left - 8} y={sy(values[values.length - 1]!)} dy="0.35em" textAnchor="end">
            {formatUnitAmount(values[values.length - 1]!)}
          </text>
        ) : null}
        <path className="c-step" d={path} />
        {steps.map((step) => (
          <g key={step.key}>
            <circle className="c-pt" cx={step.x} cy={step.yTo} r={4} fill="#121212" />
            <text
              className="c-pct"
              x={step.x}
              y={Math.min(step.yFrom, step.yTo) - 10}
              textAnchor={step.x > W - 70 ? "end" : step.x < PAD.left + 40 ? "start" : "middle"}
            >
              {step.pct === null ? "" : formatPercent(step.pct)}
            </text>
          </g>
        ))}
        {segments.length === 1 ? (
          <text className="c-val" x={(segments[0]!.x0 + segments[0]!.x1) / 2} y={segments[0]!.y - 10} textAnchor="middle">
            {formatUnitAmount(segments[0]!.value)} per {unitWord(unit)} throughout
          </text>
        ) : null}
      </svg>
      {skipped ? (
        <p className="dr-foot">
          {skipped === 1 ? "One earlier state is" : `${skipped} earlier states are`} left off the chart because its size was
          read in a different unit.
        </p>
      ) : null}
    </>
  );
}
