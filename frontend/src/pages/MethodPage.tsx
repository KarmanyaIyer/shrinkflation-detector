import { useOutletContext } from "react-router";
import { GITHUB_URL, type OutletContext } from "../components/Layout";
import { usePageTitle } from "../lib/useApi";

export function MethodPage() {
  usePageTitle("Method");
  const { stats } = useOutletContext<OutletContext>();
  const store = stats.data?.location_label ?? "one Kroger store";

  return (
    <div className="prose">
      <h1>Method</h1>
      <p>What this site measures and how the numbers on it are produced.</p>

      <h2>Data source</h2>
      <ul>
        <li>
          Product names, size text, and prices come from the Kroger Public API (Products and Locations)
          for a single store: {store}.
        </li>
        <li>Prices are regular shelf prices. Promotional prices are recorded when present but never compared.</li>
        <li>
          Names and sizes are shown exactly as the API returns them. Parsed quantities are stored separately
          and never overwrite the source text.
        </li>
        <li>This is an independent project and is not affiliated with Kroger.</li>
      </ul>

      <h2>How a change is detected</h2>
      <ul>
        <li>
          Every tracked product is checked once a day. A new snapshot is stored only when the size text,
          the regular price, or the description changes. Otherwise the current snapshot's "seen through"
          date is extended.
        </li>
        <li>
          Size text such as <code>12 x 12 fl oz</code> or <code>1/2 gal</code> is normalized to a base
          quantity. Deterministic rules handle most labels. The rest go to an open-weight language model
          (DeepSeek V4 Flash) in JSON mode, validated against a schema, with one repair retry and escalation
          to a stronger model when confidence is low. Parses are cached by label text.
        </li>
        <li>
          Consecutive snapshots are compared and classified as a size decrease, a size increase, a price
          increase, or a price decrease. The unit price is the regular price divided by the normalized
          quantity, shown per ounce, fluid ounce, each, foot, or square foot.
        </li>
        <li>
          Differences under 0.5% are treated as rounding noise, so 16 oz and 1 lb count as the same size.
          Size changes above 80% and parses below 0.7 confidence are held for review instead of being
          published.
        </li>
        <li>
          The two dates on each change are the last day the old state was observed and the first day the
          new state was observed. The change happened somewhere in between.
        </li>
      </ul>

      <h2>What is excluded</h2>
      <ul>
        <li>Items sold by weight, where the package is not a fixed size.</li>
        <li>Promotional prices. Only the regular price is compared.</li>
        <li>Relabels where the size text changed but the quantity did not, for example 16 oz to 1 lb.</li>
        <li>
          Size changes whose two readings cannot be compared, for example when one label could not be
          parsed. These go to a review queue.
        </li>
      </ul>

      <h2>Agent limits</h2>
      <ul>
        <li>
          The Ask page runs a tool-calling model with read-only tools over the same database: product search,
          product history, recent changes, and tracking stats. Tool arguments are validated before any query
          runs.
        </li>
        <li>
          Each visitor gets 10 questions per day, at most 10 per minute, of up to 400 characters. There is
          also a global daily spend cap for the model.
        </li>
        <li>
          Every request and every model call is traced. Token counts, cost, and the trace id shown under each
          answer are logged.
        </li>
      </ul>

      <h2>Source code</h2>
      <p>
        The backend (Python, FastAPI, Postgres) and this site (React, TypeScript) are on GitHub:{" "}
        <a href={GITHUB_URL} rel="noopener">
          KarmanyaIyer/shrinkflation-detector
        </a>
        .
      </p>
    </div>
  );
}
