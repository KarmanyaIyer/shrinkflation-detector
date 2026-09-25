import { countNoun, formatInt, formatMoney, numberWord } from "../lib/format";
import { hourWord, METHOD } from "../lib/method";
import type { MethodFacts } from "../lib/story";

// Every claim here was checked against the backend code before it was written. Live numbers
// come from the stats endpoint; without them (API down) the steps still read correctly. The
// thresholds and limits come from lib/method.ts, which names the backend file of each.
// "38 price increases, 36 price cuts and three size decreases", leaving out kinds with none.
function publishedParts(m: MethodFacts): string {
  const parts = [
    [m.priceUp, "price increase"],
    [m.priceDown, "price cut"],
    [m.shrinks, "size decrease"],
    [m.grows, "size increase"],
  ]
    .filter(([count]) => (count as number) > 0)
    .map(([count, noun]) => countNoun(count as number, noun as string));
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : (parts[0] ?? "");
  return m.shrinkPriceCuts ? `${list}, plus ${countNoun(m.shrinkPriceCuts, "size decrease")} that came with a lower price per unit` : list;
}

export function MethodSection({ method }: { method: MethodFacts | null }) {
  const m = method;
  const M = METHOD;
  const run =
    m?.runDate && m.runChecked !== null && m.runErrors !== null
      ? m.runOk
        ? ` The ${m.runDate} run checked ${formatInt(m.runChecked)} products in ${m.runSpan ?? "one pass"} with ${
            m.runErrors === 0 ? "no errors" : countNoun(m.runErrors, "error")
          }.`
        : ` The ${m.runDate} run checked ${formatInt(m.runChecked)} of ${formatInt(m.products)} products with ${countNoun(m.runErrors, "error")}; batches that failed were skipped.`
      : "";
  return (
    <aside className="method" id="how" aria-labelledby="m-h">
      <h2 id="m-h">How this works</h2>
      <ol>
        <li>
          <strong>Collection.</strong> Every day at {String(M.refreshHourUtc).padStart(2, "0")}:00 UTC, which is{" "}
          {hourWord(M.refreshHourUtc - 4)} Eastern in summer and {hourWord(M.refreshHourUtc - 5)} in winter,
          a job asks Kroger’s public product API for every tracked product
          {m ? `: ${formatInt(m.products)} products in ${m.categories} categories${m.apiCalls !== null ? `, ${formatInt(m.apiCalls)} API calls` : ""}` : ""}.
          {run}
        </li>
        <li>
          <strong>Reading size text.</strong> Each listing’s size text, such as “12 oz”, “2 pk / 12 fl oz” or “192 ct”,
          becomes a quantity and a unit. Plain text is parsed by rules. Anything else goes to DeepSeek V4.1 Flash, which
          hands off to DeepSeek V4 Pro when its reading is invalid or its confidence is under {M.escalateBelowConfidence}; ambiguous multipacks go
          straight to Pro. Every model reply must fit a Pydantic schema before it is stored
          {m ? `. ${formatInt(m.llmCalls)} model calls, for size reading and the assistant together, have cost ${m.llmCost}` : ""}.
        </li>
        <li>
          <strong>Price per unit.</strong> The regular shelf price divided by the parsed quantity, converted to one unit
          per kind: per oz for weight, per fl oz for volume, per item for counts, and per ft or sq ft for lengths and
          areas. Promo prices are recorded but not used.
        </li>
        <li>
          <strong>Storage.</strong> A new record is stored only when the size text, the regular price or the product name
          differs from the previous check{m ? `. ${formatInt(m.states)} records hold the history of ${formatInt(m.products)} products` : ""}.
        </li>
        <li>
          <strong>Publishing.</strong> A size change is published when both readings can be compared, both have a
          confidence of at least {M.publishMinConfidence}, and the size moved by at least {M.sizeNoisePct}% and at most{" "}
          {M.sizeSuspectPct}%. A reading under {M.publishMinConfidence} or a move over {M.sizeSuspectPct}% is held for
          review, and so is a size text change whose two readings cannot be compared. A size text edit that moves the size
          by less than {M.sizeNoisePct}% is not published as a size change. A price change is published when the regular price moved
          by at least {M.priceNoisePct}%.
          {m && m.published > 0 ? ` ${formatInt(m.published)} so far: ${publishedParts(m)}.` : ""}
        </li>
        <li>
          <strong>The assistant.</strong> It can only call four read-only tools: <code>search_products</code>,{" "}
          <code>get_product_history</code>, <code>list_recent_changes</code> and <code>get_tracking_stats</code>.
          Arguments are validated with Pydantic, it must call a tool before it answers, and it gets at most{" "}
          {numberWord(M.maxToolRounds)} rounds of tool calls per question. Each visitor gets {M.questionsPerVisitorPerDay}{" "}
          questions a day, and the whole site has a {formatMoney(M.dailyModelBudgetUsd)} daily model budget. Requests and
          model calls are traced with OpenTelemetry.
        </li>
      </ol>
      <p className="stack">
        <span>Stack</span>Python 3.13, FastAPI, SQLAlchemy 2, Pydantic v2, Postgres on Neon, React 19 and TypeScript,
        Vite, Docker, GitHub Actions, Azure Container Apps, OpenTelemetry
      </p>
    </aside>
  );
}
