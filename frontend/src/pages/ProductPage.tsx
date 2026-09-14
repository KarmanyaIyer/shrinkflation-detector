import { Link, useParams } from "react-router";
import { getProduct } from "../api/client";
import { ApiError } from "../api/http";
import type { ProductDetail, SnapshotOut } from "../api/types";
import { ChangesTable } from "../components/ChangesTable";
import { ProductThumb, productSubline } from "../components/ProductCell";
import { Empty, LoadError, SkeletonLines, SkeletonRows } from "../components/Status";
import { UnitPriceChart } from "../components/UnitPriceChart";
import {
  daysObserved,
  formatDate,
  formatDateRange,
  formatDateShort,
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
  const facts: { label: string; value: string }[] = [
    { label: "Size", value: current.size_text },
    { label: "Parsed as", value: formatQuantity(current.display_quantity, current.display_unit) ?? "not parsed" },
    { label: "Regular price", value: formatMoney(current.price_regular) ?? "not listed" },
  ];
  if (current.price_promo) {
    facts.push({ label: "Promo price", value: formatMoney(current.price_promo) ?? "" });
  }
  facts.push(
    { label: "Per unit", value: formatUnitPrice(current.unit_price?.value, current.unit_price?.unit) ?? "not available" },
    { label: "Parse", value: parseLabel(current) },
    { label: "Seen since", value: formatDate(current.first_seen_at) ?? "" },
    { label: "Checks", value: formatInt(current.observations) },
  );
  return (
    <dl className="facts">
      {facts.map((fact) => (
        <div className="fact" key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function HistoryTable({ snapshots }: { snapshots: SnapshotOut[] }) {
  return (
    <table className="tbl tbl-history">
      <colgroup>
        <col className="col-size" />
        <col className="col-price" />
        <col className="col-unit" />
        <col className="col-seen" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">Size</th>
          <th scope="col">Price</th>
          <th scope="col">Per unit</th>
          <th scope="col">Seen</th>
        </tr>
      </thead>
      <tbody>
        {snapshots.map((s) => (
          <tr key={s.id}>
            <td className="mono-line" data-label="Size">
              {s.size_text}
            </td>
            <td className="mono-line" data-label="Price">
              {formatMoney(s.price_regular) ?? <span className="same">no price</span>}
            </td>
            <td className="mono-line" data-label="Per unit">
              {formatUnitPrice(s.unit_price?.value, s.unit_price?.unit) ?? (
                <span className="same">{s.quantity ? "no price" : "size not parsed"}</span>
              )}
            </td>
            <td className="mono-line" data-label="Seen">
              {formatDateRange(s.first_seen_at, s.last_seen_at)}
              <span className="same nowrap"> {pluralize(daysObserved(s.first_seen_at, s.last_seen_at), "day")}</span>
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
          <p className="product-sub">{productSubline(product)}</p>
          <p className="product-meta">
            Kroger id {product.id}
            {detail.upc && detail.upc !== product.id ? `, UPC ${detail.upc}` : ""}, tracked since{" "}
            {formatDateShort(detail.first_seen_at)}, last checked {formatDateShort(detail.last_seen_at)}
          </p>
        </div>
      </div>

      <section className="subsection" aria-labelledby="current">
        <h2 id="current">Now</h2>
        {current ? <CurrentState current={current} /> : <Empty title="No state recorded yet." />}
      </section>

      <section className="subsection" aria-labelledby="history">
        <div className="section-head">
          <h2 id="history">History</h2>
          <span className="section-count">{pluralize(detail.snapshots.length, "state")}</span>
        </div>
        {detail.snapshots.length > 0 ? <HistoryTable snapshots={detail.snapshots} /> : <Empty title="No states recorded yet." />}
        {priced >= 2 ? (
          <div className="chart-wrap">
            <UnitPriceChart snapshots={detail.snapshots} />
          </div>
        ) : null}
      </section>

      <section className="subsection" aria-labelledby="changes">
        <div className="section-head">
          <h2 id="changes">Changes</h2>
          <span className="section-count">{pluralize(detail.changes.length, "change")}</span>
        </div>
        {detail.changes.length > 0 ? (
          <ChangesTable items={detail.changes} showKind />
        ) : (
          <Empty
            title="Nothing has changed yet."
            note={detail.snapshots.length === 1 ? "One state observed so far." : undefined}
          />
        )}
      </section>
    </>
  );
}

export function ProductPage() {
  const { id = "" } = useParams();
  const state = useApi((signal) => getProduct(id, signal), [id]);
  usePageTitle(state.data?.product.description ?? "Product");

  return (
    <div className="page wrap">
      <p className="crumb">
        <Link to="/#changes">All changes</Link>
      </p>
      {state.status === "loading" ? (
        <>
          <SkeletonLines lines={2} className="title-sk" />
          <SkeletonRows rows={3} cols={4} />
        </>
      ) : state.status === "error" ? (
        state.error instanceof ApiError && state.error.status === 404 ? (
          <>
            <h1>Product not found.</h1>
            <p className="note">
              No tracked product has the id {id}. <Link to="/">Back to the start</Link>
            </p>
          </>
        ) : (
          <LoadError what="product" error={state.error} retry={state.reload} />
        )
      ) : (
        <Detail detail={state.data} />
      )}
    </div>
  );
}
