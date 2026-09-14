import type { Stats } from "../api/types";
import { formatInt, formatMoney } from "../lib/format";
import type { AsyncState } from "../lib/useApi";
import { useReveal } from "../lib/useReveal";
import { GITHUB_URL } from "./Shell";

export function MethodSection({ stats }: { stats: AsyncState<Stats> }) {
  const ref = useReveal<HTMLElement>();
  const store = stats.status === "ok" ? stats.data.location_label : "one Cincinnati-area Kroger";
  return (
    <section className="section wrap" id="how" ref={ref} aria-labelledby="how-title">
      <div className="section-head">
        <h2 id="how-title">How it works</h2>
      </div>

      <div className="how">
        <div className="step">
          <h3>Observe</h3>
          <p>
            Every morning the Kroger public API is asked for the name, size text, and regular price of each tracked
            product at {store}. A new state is stored only when one of those changed; otherwise the current state's
            last-seen date moves forward.
          </p>
        </div>
        <div className="step">
          <h3>Parse</h3>
          <p>
            Size text like <code>12 x 12 fl oz</code> or <code>1/2 gal</code> is turned into a quantity. Rules handle
            most labels. The rest go to DeepSeek V4.1 Flash in JSON mode, checked against a schema, with one repair
            retry and escalation to V4 Pro when confidence is low. Parses are cached by label text.
          </p>
        </div>
        <div className="step">
          <h3>Publish</h3>
          <p>
            Consecutive states are compared and filed as a size decrease, size increase, price increase, or price
            decrease. Per-unit price is the regular price over the parsed quantity. The dates on a change run from the
            last day the old state was seen to the first day the new one was.
          </p>
        </div>
        <div className="step">
          <h3>Not counted</h3>
          <p>
            Items sold by weight. Promotional prices. Relabels where the quantity did not move, such as 16 oz to 1 lb.
            Differences under 0.5%. Size changes above 80% and parses below 0.7 confidence wait in a review queue
            instead of being published.
          </p>
        </div>
        <div className="step">
          <h3>Asking</h3>
          <p>
            The question box runs a tool-calling model with read-only tools over the same database: product search,
            product history, recent changes, and stats. Arguments are validated before any query runs. Each visitor
            gets 10 questions a day of up to 400 characters, and the model has a daily spend cap.
          </p>
        </div>
        <div className="step">
          <h3>Source</h3>
          <p>
            Python, FastAPI, and Postgres behind the API; React and TypeScript on this page; GitHub Actions deploys
            to Azure Container Apps. Everything is at{" "}
            <a href={GITHUB_URL} rel="noopener">
              KarmanyaIyer/shrinkflation-detector
            </a>
            .
            {stats.status === "ok" ? (
              <>
                {" "}
                Model spend so far: {formatMoney(stats.data.llm_cost_usd)} over {formatInt(stats.data.llm_calls)} calls.
              </>
            ) : null}
          </p>
        </div>
      </div>
    </section>
  );
}
