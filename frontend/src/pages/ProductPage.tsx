import { Link, useParams } from "react-router";
import { getProduct } from "../api/client";
import { ApiError } from "../api/http";
import type { ProductDetail, SnapshotOut } from "../api/types";
import { ChangesLedger } from "../components/ChangesLedger";
import { ProductThumb, productSubline } from "../components/ProductCell";
import { Loading, LoadError } from "../components/Status";
import { UnitPriceChart } from "../components/UnitPriceChart";
import {
  daysObserved,
  formatDate,
  formatInt,
  formatMoney,
  formatQuantity,
  formatUnitPrice,
  pluralize,
} from "../lib/format";
import { useApi, usePageTitle } from "../lib/useApi";

export function parseLabel(snapshot: SnapshotOut): string {
  if (snapshot.parse_method === "rule") return "parsed by rules";
  if (snapshot.parse_method === "llm") {
    const confidence = snapshot.parse_confidence;
    return confidence === null || confidence === undefined
      ? "parsed by language model"
      : `parsed by language model, confidence ${confidence.toFixed(2)}`;
  }
  return "not parsed";
}

function CurrentState({ current }: { current: SnapshotOut }) {
  const facts: { label: string; value: string; sans?: boolean }[] = [
    { label: "Size", value: current.size_text },
    { label: "Normalized", value: formatQuantity(current.display_quantity, current.display_unit) ?? "not parsed" },
    { label: "Regular price", value: formatMoney(current.price_regular) ?? "not listed" },
  ];
  if (current.price_promo) {
    facts.push({ label: "Promo price", value: formatMoney(current.price_promo) ?? "" });
  }
  facts.push(
    { label: "Unit price", value: formatUnitPrice(current.unit_price?.value, current.unit_price?.unit) ?? "not available" },
    { label: "Parse", value: parseLabel(current), sans: true },
    { label: "Seen since", value: formatDate(current.first_seen_at) ?? "" },
    { label: "Observations", value: formatInt(current.observations) },
  );
  return (
    <dl className="facts">
      {facts.map((fact) => (
        <div className="fact" key={fact.label}>
          <dt className="label">{fact.label}</dt>
          <dd className={fact.sans ? "fact-value sans" : "fact-value"}>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function HistoryLedger({ snapshots }: { snapshots: SnapshotOut[] }) {
  return (
    <table className="ledger history stacked-sm">
      <thead>
        <tr>
          <th scope="col">Size</th>
          <th scope="col" className="num">
            Regular price
          </th>
          <th scope="col" className="num">
            Unit price
          </th>
          <th scope="col">Seen from</th>
          <th scope="col">Seen through</th>
          <th scope="col" className="num">
            Days observed
          </th>
        </tr>
      </thead>
      <tbody>
        {snapshots.map((s) => (
          <tr key={s.id}>
            <td className="mono-cell" data-label="Size">
              {s.size_text}
            </td>
            <td className="num" data-label="Regular price">
              {formatMoney(s.price_regular) ?? "no price"}
            </td>
            <td className="num" data-label="Unit price">
              {formatUnitPrice(s.unit_price?.value, s.unit_price?.unit) ?? "not available"}
            </td>
            <td className="mono-cell" data-label="Seen from">
              {formatDate(s.first_seen_at)}
            </td>
            <td className="mono-cell" data-label="Seen through">
              {formatDate(s.last_seen_at)}
            </td>
            <td className="num" data-label="Days observed">
              {formatInt(daysObserved(s.first_seen_at, s.last_seen_at))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Detail({ detail }: { detail: ProductDetail }) {
  const { product, current } = detail;
  const priced = detail.snapshots.filter((s) => s.unit_price).length;
  return (
    <>
      <div className="product-head">
        <ProductThumb src={product.image_url} large />
        <div>
          <h1>{product.description}</h1>
          <div className="product-sub">{productSubline(product)}</div>
          <div className="product-meta">
            Kroger product id {product.id} · UPC {detail.upc ?? "not listed"} · tracked since{" "}
            {formatDate(detail.first_seen_at)}
          </div>
        </div>
      </div>

      <section className="section" aria-labelledby="current">
        <div className="section-head">
          <h2 id="current">Current state</h2>
          <span className="count">last checked {formatDate(detail.last_seen_at)}</span>
        </div>
        {current ? <CurrentState current={current} /> : <p className="note">No state recorded yet.</p>}
      </section>

      <section className="section" aria-labelledby="history">
        <div className="section-head">
          <h2 id="history">History</h2>
          <span className="count">{pluralize(detail.snapshots.length, "state")}</span>
        </div>
        {detail.snapshots.length > 0 ? (
          <HistoryLedger snapshots={detail.snapshots} />
        ) : (
          <p className="note">No snapshots recorded yet.</p>
        )}
        <div className="subsection">
          <span className="label">Unit price over time</span>
          {priced >= 2 ? (
            <UnitPriceChart snapshots={detail.snapshots} />
          ) : (
            <p className="note chart-empty">Only one state observed so far.</p>
          )}
        </div>
      </section>

      <section className="section" aria-labelledby="changes">
        <div className="section-head">
          <h2 id="changes">Changes</h2>
          <span className="count">{pluralize(detail.changes.length, "change")}</span>
        </div>
        {detail.changes.length > 0 ? (
          <ChangesLedger items={detail.changes} first="kind" />
        ) : (
          <p className="note">No changes recorded yet.</p>
        )}
      </section>
    </>
  );
}

export function ProductPage() {
  const { id = "" } = useParams();
  const state = useApi((signal) => getProduct(id, signal), [id]);
  usePageTitle(state.data?.product.description ?? "Product");

  if (state.status === "loading") return <Loading what="product" />;
  if (state.status === "error") {
    if (state.error instanceof ApiError && state.error.status === 404) {
      return (
        <>
          <h1>Product not found.</h1>
          <p className="note page-note">
            No tracked product has the id {id}. <Link to="/">Back to the feed</Link>
          </p>
        </>
      );
    }
    return <LoadError what="product" error={state.error} retry={state.reload} />;
  }
  return <Detail detail={state.data} />;
}
