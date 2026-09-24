import { formatInt, pluralize } from "../lib/format";
import type { MethodFacts } from "../lib/story";

// Every claim here was checked against the backend code before it was written. Numbers come
// from the stats endpoint; without them (API down) the steps still read correctly.
export function MethodSection({ method }: { method: MethodFacts | null }) {
  const m = method;
  const run =
    m?.runDate && m.runChecked !== null && m.runErrors !== null
      ? m.runOk
        ? ` The ${m.runDate} run checked ${formatInt(m.runChecked)} products in ${m.runSpan ?? "one pass"} with ${
            m.runErrors === 0 ? "no errors" : pluralize(m.runErrors, "error")
          }.`
        : ` The ${m.runDate} run checked ${formatInt(m.runChecked)} of ${formatInt(m.products)} products with ${pluralize(
            m.runErrors,
            "error",
          )}; batches that failed were skipped.`
      : "";
  return (
    <aside className="method" id="how" aria-labelledby="m-h">
      <h2 id="m-h">How this works</h2>
      <ol>
        <li>
          <strong>Collection.</strong> Every day at 11:00 UTC, which is 7 a.m. Eastern in summer and 6 a.m. in winter,
          a job asks Kroger’s public product API for every tracked product
          {m ? `: ${formatInt(m.products)} products in ${m.categories} categories${m.apiCalls !== null ? `, ${formatInt(m.apiCalls)} API calls` : ""}` : ""}.
          {run}
        </li>
        <li>
          <strong>Reading size text.</strong> Each listing’s size text, such as “12 oz”, “2 pk / 12 fl oz” or “192 ct”,
          becomes a quantity and a unit. Plain text is parsed by rules. Anything else goes to DeepSeek V4.1 Flash, which
          hands off to DeepSeek V4 Pro when its reading is invalid or its confidence is under 0.6; ambiguous multipacks go
          straight to Pro. Every model reply must fit a Pydantic schema before it is stored
          {m ? `. ${formatInt(m.llmCalls)} model calls, for size reading and the assistant together, have cost ${m.llmCost}` : ""}.
        </li>
        <li>
          <strong>Price per unit.</strong> The regular shelf price divided by the parsed quantity, converted to one unit
          per kind: per oz for weight, per fl oz for volume, per item for counts, and per ft or sq ft for lengths and
          areas. Promo prices are recorded but not used.
        </li>
        <li>
          <strong>Storage.</strong> A new state is stored only when the size text, the regular price or the product name
          differs from the previous check{m ? `. ${formatInt(m.states)} states hold the history of ${formatInt(m.products)} products` : ""}.
        </li>
        <li>
          <strong>Publishing.</strong> A size change is published when both states parsed with a confidence of at least
          0.7 and the size moved by at least 0.5% and at most 80%; larger jumps are held for review. A price change is
          published when the regular price moved by at least 0.5%.
          {m
            ? ` ${formatInt(m.published)} so far: ${pluralize(m.priceUp, "price increase")}, ${pluralize(m.priceDown, "price cut")}, ${pluralize(
                m.shrinks,
                "size decrease",
              )} and ${pluralize(m.grows, "size increase")}${
                m.shrinkPriceCuts ? `, plus ${pluralize(m.shrinkPriceCuts, "size decrease")} that came with a lower price per unit` : ""
              }.`
            : ""}
        </li>
        <li>
          <strong>The assistant.</strong> It can only call four read-only tools: <code>search_products</code>,{" "}
          <code>get_product_history</code>, <code>list_recent_changes</code> and <code>get_tracking_stats</code>.
          Arguments are validated with Pydantic, it must call a tool before it answers, and it gets at most four rounds of
          tool calls per question. Each visitor gets 10 questions a day, and the whole site has a $1.00 daily model
          budget. Requests and model calls are traced with OpenTelemetry.
        </li>
      </ol>
      <p className="stack">
        <span>Stack</span>Python 3.13, FastAPI, SQLAlchemy 2, Pydantic v2, Postgres on Neon, React 19 and TypeScript,
        Vite, Docker, GitHub Actions, Azure Container Apps, OpenTelemetry
      </p>
    </aside>
  );
}
