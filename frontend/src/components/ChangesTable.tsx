import type { ChangeOut, SnapshotOut } from "../api/types";
import {
  ARROW,
  deltaClass,
  formatDate,
  formatDateRange,
  formatMoney,
  formatPercent,
  formatUnitAmount,
  formatUnitPrice,
} from "../lib/format";
import { kindLabel, kindTone } from "../lib/kinds";
import { LinkRow } from "./LinkRow";
import { ProductCell } from "./ProductCell";

const SIZE_KINDS = new Set(["shrink", "shrink_price_cut", "grow"]);

// The one number a row leads with: the size change for size kinds, the price change otherwise.
function headline(change: ChangeOut): { value: string; tone: string } {
  if (SIZE_KINDS.has(change.kind)) {
    const value = formatPercent(change.size_change_pct);
    if (value) return { value, tone: deltaClass(change.size_change_pct, true) };
  }
  const value = formatPercent(change.price_change_pct);
  if (value) return { value, tone: deltaClass(change.price_change_pct, false) };
  return { value: kindLabel(change.kind), tone: kindTone(change.kind) };
}

function sizeLine(before: SnapshotOut | null | undefined, after: SnapshotOut | null | undefined) {
  if (!after) return null;
  if (before && before.size_text !== after.size_text) {
    return (
      <span>
        {before.size_text} {ARROW} {after.size_text}
      </span>
    );
  }
  return (
    <span>
      {after.size_text} <span className="same">unchanged</span>
    </span>
  );
}

function priceLine(before: SnapshotOut | null | undefined, after: SnapshotOut | null | undefined) {
  const to = formatMoney(after?.price_regular);
  if (!to) return null;
  const from = formatMoney(before?.price_regular);
  if (from && from !== to) {
    return (
      <span>
        {from} {ARROW} {to}
      </span>
    );
  }
  return (
    <span>
      {to} <span className="same">unchanged</span>
    </span>
  );
}

function UnitCell({ change }: { change: ChangeOut }) {
  const before = change.before?.unit_price;
  const after = change.after?.unit_price;
  const to = formatUnitPrice(after?.value, after?.unit);
  if (!to) {
    return (
      <td className="td-unit" data-label="Per unit">
        <span className="same">{change.after?.quantity ? "no price" : "size not parsed"}</span>
      </td>
    );
  }
  const from = before && before.unit === after?.unit ? formatUnitAmount(before.value) : null;
  const pct = formatPercent(change.unit_price_change_pct);
  return (
    <td className="td-unit" data-label="Per unit">
      <div className="mono-line">
        {from ? `${from} ${ARROW} ` : ""}
        {to}
      </div>
      {pct ? <div className={`unit-pct ${deltaClass(change.unit_price_change_pct, false)}`}>{pct}</div> : null}
    </td>
  );
}

function whenTitle(change: ChangeOut): string | undefined {
  const before = change.before;
  const after = change.after;
  if (!before || !after) return undefined;
  const last = formatDate(change.before_seen_at);
  const first = formatDate(change.after_seen_at);
  if (!last || !first) return undefined;
  return `${before.size_text} at ${formatMoney(before.price_regular) ?? "no price"} was last seen ${last}. ${after.size_text} at ${formatMoney(after.price_regular) ?? "no price"} was first seen ${first}.`;
}

export function ChangeRow({ change, showKind }: { change: ChangeOut; showKind: boolean }) {
  const lead = headline(change);
  return (
    <LinkRow to={`/products/${change.product.id}`}>
      <ProductCell product={change.product} />
      <td className="td-change" data-label="Change">
        {showKind ? <div className={`kind ${kindTone(change.kind)}`}>{kindLabel(change.kind)}</div> : null}
        <div className={`delta ${lead.tone}`}>{lead.value}</div>
        <div className="mono-line">{sizeLine(change.before, change.after)}</div>
        <div className="mono-line">{priceLine(change.before, change.after)}</div>
      </td>
      <UnitCell change={change} />
      <td className="td-when" data-label="When">
        <span className="mono-line" title={whenTitle(change)}>
          {formatDateRange(change.before_seen_at, change.after_seen_at) ?? formatDate(change.detected_at)}
        </span>
      </td>
    </LinkRow>
  );
}

export function ChangesTable({ items, showKind }: { items: ChangeOut[]; showKind: boolean }) {
  return (
    <table className="tbl tbl-changes">
      <colgroup>
        <col className="col-product" />
        <col className="col-change" />
        <col className="col-unit" />
        <col className="col-when" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">Product</th>
          <th scope="col">Change</th>
          <th scope="col">Per unit</th>
          <th scope="col">When</th>
        </tr>
      </thead>
      <tbody>
        {items.map((change) => (
          <ChangeRow key={change.id} change={change} showKind={showKind} />
        ))}
      </tbody>
    </table>
  );
}
