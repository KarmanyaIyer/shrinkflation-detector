import { countNoun, formatInt, formatMoney, numberWord } from "../lib/format";
import { hourWord, METHOD } from "../lib/method";
import type { MethodFacts } from "../lib/story";
import { NoBreak } from "./NoBreak";

// Every claim here was checked against the backend code before it was written. Live numbers
// come from the stats endpoint; without them (API down) the steps still read correctly. The
// thresholds and limits come from lib/method.ts, which names the backend file of each.

// "38 price increases, 36 price cuts and three size decreases", leaving out kinds with none.
function publishedParts(m: MethodFacts): string {
  const kinds: [number, string][] = [
    [m.priceUp, "price increase"],
    [m.priceDown, "price cut"],
    [m.shrinks, "size decrease"],
    [m.grows, "size increase"],
  ];
  const parts = kinds.filter(([count]) => count > 0).map(([count, noun]) => countNoun(count, noun));
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : (parts[0] ?? "");
  return m.shrinkPriceCuts ? `${list}, plus ${countNoun(m.shrinkPriceCuts, "size decrease")} that came with a lower price per unit` : list;
}

// The last run in one sentence. A partial run's coverage is already in the freshness line at
// the top, so this one gives the errors instead.
function runSentence(m: MethodFacts | null): string {
  if (!m?.runDate || m.runChecked === null || m.runErrors === null) return "";
  if (!m.runOk) {
    return m.runErrors > 0 ? ` The ${m.runDate} run logged ${countNoun(m.runErrors, "error")}, and the batches that failed were skipped.` : "";
  }
  const which = m.runChecked >= m.products ? "all of them" : `${formatInt(m.runChecked)} of them`;
  const span = m.runSpan ? ` in ${m.runSpan}` : "";
  const errors = m.runErrors === 0 ? "no errors" : countNoun(m.runErrors, "error");
  return ` The ${m.runDate} run checked ${which}${span} with ${errors}.`;
}

export function MethodSection({ method }: { method: MethodFacts | null }) {
  const m = method;
  const M = METHOD;
  return (
    <aside className="method" id="how" aria-labelledby="m-h">
      <h2 id="m-h">How this works</h2>
      <ol>
        <li>
          <strong>Collection.</strong> Every day at {String(M.refreshHourUtc).padStart(2, "0")}:00 UTC, which is{" "}
          <span className="nw">{hourWord(M.refreshHourUtc - 4)}</span> Eastern in summer and{" "}
          <span className="nw">{hourWord(M.refreshHourUtc - 5)}</span> in winter,
          a job asks Kroger’s public product API for every tracked product
          {m ? `: ${formatInt(m.products)} products in ${formatInt(m.categories)} categories${m.apiCalls !== null ? `, ${formatInt(m.apiCalls)} API calls` : ""}` : ""}.
          {runSentence(m)}
        </li>
        <li>
          <strong>Reading size text.</strong> Each listing’s size text, such as{" "}
          <NoBreak text="“12 oz”, “2 pk / 12 fl oz” or “192 ct”," /> becomes a quantity and a unit. Plain text is
          parsed by rules. Anything else goes to DeepSeek V4.1 Flash, which hands off to DeepSeek V4 Pro when its reading
          is invalid or its confidence is under {M.escalateBelowConfidence}; ambiguous multipacks go straight to Pro.
          Every model reply must fit a Pydantic schema before it is stored. Model spending is capped at{" "}
          {formatMoney(M.dailyModelBudgetUsd)} a day
          {m ? `; ${formatInt(m.llmCalls)} calls, for size reading and the assistant together, have cost ${m.llmCost} in total` : ""}.
        </li>
        <li>
          <strong>Price per unit.</strong> The regular shelf price divided by the parsed quantity, converted to one unit
          per kind: per ounce for weight, per fluid ounce for volume, per item for counts and per foot or square foot for
          lengths and areas. Promo prices are recorded but not used.
        </li>
        <li>
          <strong>Storage.</strong> A new record is stored only when the size text, the regular price or the product name
          differs from the previous check.{m ? ` So far there are ${formatInt(m.states)} records.` : ""}
        </li>
        <li>
          <strong>Publishing.</strong> A size change is published when the two readings can be compared, both have a
          confidence of at least {M.publishMinConfidence} and the size moved by {M.sizeNoisePct}% to {M.sizeSuspectPct}%.
          A reading under {M.publishMinConfidence} or a move over {M.sizeSuspectPct}% is held for review, and so is a size
          text change whose two readings cannot be compared. A price move of at least {M.priceNoisePct}% is published on
          its own when the size reading did not change, and as part of the size change when there is one.
          {m && m.published > 0 ? ` So far ${formatInt(m.published)} are published: ${publishedParts(m)}.` : ""}
        </li>
        <li>
          <strong>The assistant.</strong> It can only call four read-only tools: <code>search_products</code>,{" "}
          <code>get_product_history</code>, <code>list_recent_changes</code> and <code>get_tracking_stats</code>.
          Arguments are validated with Pydantic, it must call a tool before it answers, and it gets at most{" "}
          {numberWord(M.maxToolRounds)} rounds of tool calls per question. Requests and model calls are traced with
          OpenTelemetry.
        </li>
      </ol>
      <p className="stack">
        <span>Stack</span>Python 3.13, FastAPI, SQLAlchemy 2, Pydantic v2, Postgres on Neon, React 19 and TypeScript,
        Vite, Docker, GitHub Actions, Azure Container Apps, OpenTelemetry
      </p>
    </aside>
  );
}
