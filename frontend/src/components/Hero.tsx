import { useCallback, useState } from "react";
import type { FieldProduct, Stats } from "../api/types";
import { formatDateShort, formatInt } from "../lib/format";
import type { AsyncState } from "../lib/useApi";
import { AskPanel } from "./AskPanel";
import { Field } from "./Field";

function Mark() {
  return (
    <svg className="brand-icon" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <rect x="1" y="1" width="8" height="8" rx="1" fill="#141414" />
      <rect x="13" y="1" width="8" height="8" rx="1" fill="#141414" />
      <rect x="1" y="13" width="8" height="8" rx="1" fill="#141414" />
      <rect x="14.5" y="14.5" width="5" height="5" rx="1" fill="#b83a0e" />
    </svg>
  );
}

export function heroSentence(stats: Stats): string {
  const since = formatDateShort(stats.tracking_since);
  const count = formatInt(stats.products_tracked);
  const base = `Sizes and prices of ${count} products at ${stats.location_label}, checked every morning`;
  return since ? `${base} since ${since}.` : `${base}.`;
}

export function Hero({
  stats,
  field,
  slow,
}: {
  stats: AsyncState<Stats>;
  field: FieldProduct[] | null;
  slow: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [highlight, setHighlight] = useState<string[]>([]);
  const onPending = useCallback((value: boolean) => {
    setPending(value);
    if (value) setHighlight([]);
  }, []);
  const onAnswer = useCallback((ids: string[]) => setHighlight(ids), []);

  return (
    <section className="hero wrap" aria-label="Introduction">
      <div className="hero-copy">
        <div className="brand">
          <Mark />
          <span className="brand-name">Shrinkflation Detector</span>
          <span className="brand-kind">LIVE TRACKER</span>
        </div>
        <h1>
          Same price, <span className="hl">smaller box.</span>
        </h1>
        <p className="sub">
          {stats.status === "ok" ? (
            heroSentence(stats.data)
          ) : stats.status === "error" ? (
            "Sizes and prices of every tracked product at one Cincinnati-area Kroger, checked every morning."
          ) : slow ? (
            "Starting the server. The first load after a quiet spell can take up to 30 seconds."
          ) : (
            <span className="sk sub-sk" aria-hidden="true">
              <span className="sk-line" style={{ width: "96%" }} />
              <span className="sk-line" style={{ width: "54%" }} />
            </span>
          )}
        </p>
        <AskPanel onPending={onPending} onAnswer={onAnswer} />
      </div>
      <div className="hero-field">
        <Field products={field} scanning={pending} highlight={highlight} />
      </div>
    </section>
  );
}
