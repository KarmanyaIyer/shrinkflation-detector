import type { ChangeOut, SnapshotOut } from "../api/types";
import {
  ARROW,
  deltaClass,
  formatDate,
  formatMoney,
  formatPercent,
  formatQuantity,
  formatUnitPrice,
  percentChange,
} from "../lib/format";
import { kindLabel } from "../lib/kinds";
import { LinkRow } from "./LinkRow";
import { ProductCell } from "./ProductCell";

type FirstColumn = "product" | "kind";

interface Props {
  items: ChangeOut[];
  // The feed leads with the product. The product page already names it, so it leads with the kind.
  first: FirstColumn;
  // Show the kind under the product name, for feeds that mix kinds.
  showKind?: boolean;
}

function StateCell({ snapshot, label }: { snapshot: SnapshotOut | null | undefined; label: string }) {
  return (
    <td className="num" data-label={label}>
      <div className="lines">
        <div>{snapshot ? snapshot.size_text : "not recorded"}</div>
        {snapshot ? <div className="l2">{formatMoney(snapshot.price_regular) ?? "no price"}</div> : null}
      </div>
    </td>
  );
}

function quantityLine(before: SnapshotOut | null | undefined, after: SnapshotOut | null | undefined) {
  const b = formatQuantity(before?.display_quantity, before?.display_unit);
  const a = formatQuantity(after?.display_quantity, after?.display_unit);
  if (b && a) return b === a ? a : `${b} ${ARROW} ${a}`;
  return a ?? b ?? "";
}

export function ChangeRow({ change, first, showKind }: { change: ChangeOut; first: FirstColumn; showKind: boolean }) {
  const { product, before, after } = change;
  const sizePct = formatPercent(change.size_change_pct);
  const quantities = quantityLine(before, after);
  const unitBefore = formatUnitPrice(before?.unit_price?.value, before?.unit_price?.unit);
  const unitAfter = formatUnitPrice(after?.unit_price?.value, after?.unit_price?.unit);
  const unitPctValue =
    change.unit_price_change_pct ?? percentChange(before?.unit_price?.value, after?.unit_price?.value);
  const unitPct = formatPercent(unitPctValue);
  const pricePct = formatPercent(change.price_change_pct);

  const cells = (
    <>
      {first === "product" ? (
        <ProductCell product={product} extra={showKind ? kindLabel(change.kind) : undefined} />
      ) : (
        <td className="kind-td" data-label="Change">
          <span className="strong">{kindLabel(change.kind)}</span>
        </td>
      )}
      <StateCell snapshot={before} label="Before" />
      <StateCell snapshot={after} label="After" />
      <td className="num" data-label="Size">
        <div className="lines">
          <div className={sizePct ? `strong ${deltaClass(change.size_change_pct, true)}` : "muted"}>
            {sizePct ?? "not compared"}
          </div>
          {quantities ? <div className="l2">{quantities}</div> : null}
        </div>
      </td>
      <td className="num" data-label="Unit price">
        <div className="lines">
          {unitBefore && unitAfter ? (
            <>
              <div>
                {unitBefore} {ARROW} {unitAfter}
              </div>
              {unitPct ? <div className={`pct ${deltaClass(unitPctValue, false)}`}>{unitPct}</div> : null}
            </>
          ) : (
            <>
              <div className="muted">not available</div>
              {pricePct ? (
                <div className={`pct ${deltaClass(change.price_change_pct, false)}`}>price {pricePct}</div>
              ) : null}
            </>
          )}
        </div>
      </td>
      <td data-label="Dates">
        <div className="lines stack">
          <div className="date-line">
            Seen through <b>{formatDate(change.before_seen_at) ?? "unknown"}</b>
          </div>
          <div className="date-line">
            Seen since <b>{formatDate(change.after_seen_at) ?? "unknown"}</b>
          </div>
        </div>
      </td>
    </>
  );

  if (first === "product") return <LinkRow to={`/products/${product.id}`}>{cells}</LinkRow>;
  return <tr>{cells}</tr>;
}

export function ChangesLedger({ items, first, showKind = false }: Props) {
  return (
    <table className="ledger changes stacked">
      <colgroup>
        <col className={first === "product" ? "c-product" : "c-kind"} />
        <col className="c-before" />
        <col className="c-after" />
        <col className="c-size" />
        <col className="c-unit" />
        <col className="c-dates" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">{first === "product" ? "Product" : "Change"}</th>
          <th scope="col" className="num">
            Before
          </th>
          <th scope="col" className="num">
            After
          </th>
          <th scope="col" className="num">
            Size
          </th>
          <th scope="col" className="num">
            Unit price
          </th>
          <th scope="col">Dates</th>
        </tr>
      </thead>
      <tbody>
        {items.map((change) => (
          <ChangeRow key={change.id} change={change} first={first} showKind={showKind} />
        ))}
      </tbody>
    </table>
  );
}
