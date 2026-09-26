import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import type { CategoryCount, ChangeOut, FeedKind } from "../api/types";
import { formatDateRange, formatMoney, formatPercent, formatUnitAmount, unitWord } from "../lib/format";
import { direction, FILTER_LABELS, FILTER_ORDER, kindLabel, SIZE_KINDS } from "../lib/kinds";
import { unitChangePct } from "../lib/changes";
import { useOpenProduct } from "../lib/drawerRoute";
import { displayName } from "../lib/text";
import {
  countByKind,
  DEFAULT_STATE,
  defaultDescending,
  filterChanges,
  parseTableState,
  serializeTableState,
  sortChanges,
  type SortKey,
  type TableState,
} from "../lib/tableState";
import { ProductLink } from "./ProductLink";
import { SkLine } from "./Status";

export const PAGE_ROWS = 25;
// Bars are drawn to this magnitude; anything past it is cut with an overflow mark.
export const BAR_CAP = 30;

function UnitCell({ change }: { change: ChangeOut }) {
  const pct = unitChangePct(change);
  const before = change.before?.unit_price;
  const after = change.after?.unit_price;
  const dir = direction(change);
  if (pct === null) {
    return <span className="same">No price per unit: the listed size could not be read.</span>;
  }
  const size = Math.min(Math.abs(pct), BAR_CAP) / BAR_CAP;
  const over = Math.abs(pct) > BAR_CAP;
  const style = dir === "more" ? { left: "50%", width: `${size * 50}%` } : { right: "50%", width: `${size * 50}%` };
  return (
    <>
      <span className="u-line">
        <span className="u-pct">{formatPercent(pct)}</span>
        <span className="ubar" aria-hidden="true">
          <i className="ubar-z" />
          <i className={`ubar-f ${dir === "more" ? "m" : "l"}${over ? " over" : ""}`} style={style} />
        </span>
      </span>
      {before && after ? (
        <span className="u-abs">
          {formatUnitAmount(before.value)} to {formatUnitAmount(after.value)} per {unitWord(after.unit)}
        </span>
      ) : null}
    </>
  );
}

function Row({ change, onOpen }: { change: ChangeOut; onOpen: (id: string, trigger: Element | null) => void }) {
  const before = change.before;
  const after = change.after;
  const priceBefore = formatMoney(before?.price_regular);
  const priceAfter = formatMoney(after?.price_regular);
  const sizeChanged = SIZE_KINDS.has(change.kind);
  const promo = formatMoney(after?.price_promo);
  const when = formatDateRange(change.before_seen_at, change.after_seen_at) ?? formatDateRange(change.detected_at, null) ?? "";
  // A click anywhere on the row opens the product, as the name link does. Clicks on a link
  // are left to the link, and a click that ends a text selection does nothing.
  const onClick = (event: MouseEvent<HTMLTableRowElement>) => {
    if ((event.target as Element).closest("a, button")) return;
    if (window.getSelection()?.toString()) return;
    onOpen(change.product.id, event.currentTarget.querySelector(".rowbtn"));
  };
  return (
    <tr onClick={onClick} data-kind={change.kind}>
      <th scope="row" className="c-prod">
        <ProductLink id={change.product.id} className="rowbtn">
          {displayName(change.product.description)}
        </ProductLink>
        <span className="c-cat">
          {change.product.category} · {kindLabel(change.kind)}
        </span>
      </th>
      <td className="c-size" data-l="Listed size">
        {sizeChanged ? (
          <>
            <span className="chg">{after?.size_text ?? ""}</span>
            <span className="same">was {before?.size_text ?? ""}</span>
          </>
        ) : (
          <>
            {after?.size_text ?? before?.size_text ?? ""}
            <span className="same">unchanged</span>
          </>
        )}
      </td>
      <td className="c-price" data-l="Shelf price">
        {priceBefore && priceAfter && priceBefore !== priceAfter ? (
          <>
            {priceBefore} to <b>{priceAfter}</b>
          </>
        ) : (
          <>
            <b>{priceAfter ?? priceBefore ?? "no price"}</b>
            {priceAfter ? <span className="same">unchanged</span> : null}
          </>
        )}
        {promo ? <span className="promo">promo {promo}</span> : null}
      </td>
      <td className="c-unit" data-l="Price per unit">
        <UnitCell change={change} />
      </td>
      <td className="c-when" data-l="When">
        {when}
      </td>
    </tr>
  );
}

function SortHeader({
  label,
  column,
  state,
  onSort,
  children,
}: {
  label: string;
  column: SortKey;
  state: TableState;
  onSort: (column: SortKey) => void;
  children?: ReactNode;
}) {
  const active = state.sort === column;
  return (
    <th scope="col" aria-sort={active ? (state.descending ? "descending" : "ascending") : "none"}>
      <button type="button" onClick={() => onSort(column)}>
        {label}
      </button>
      {children}
    </th>
  );
}

export function ChangesSection({ changes, categories }: { changes: ChangeOut[] | null; categories: CategoryCount[] | null }) {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => parseTableState(params), [params]);
  const [showAll, setShowAll] = useState(false);
  const openProduct = useOpenProduct();

  const stateKey = `${state.kind}|${state.category ?? ""}|${state.sort}|${state.descending}`;
  useEffect(() => setShowAll(false), [stateKey]);

  function update(next: Partial<TableState>) {
    setParams(serializeTableState({ ...state, ...next }, params));
  }

  function onSort(column: SortKey) {
    if (state.sort === column) update({ descending: !state.descending });
    else update({ sort: column, descending: defaultDescending(column) });
  }

  const all = changes ?? [];
  const byKind = useMemo(() => countByKind(filterChanges(all, { kind: "all", category: state.category })), [all, state.category]);
  const rows = useMemo(() => sortChanges(filterChanges(all, state), state), [all, state]);
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const change of filterChanges(all, { kind: state.kind, category: null })) {
      counts.set(change.product.category, (counts.get(change.product.category) ?? 0) + 1);
    }
    return counts;
  }, [all, state.kind]);
  const categoryNames = useMemo(() => {
    const names = new Set<string>((categories ?? []).map((entry) => entry.category));
    for (const change of all) names.add(change.product.category);
    if (state.category) names.add(state.category);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [categories, all, state.category]);

  const shown = showAll ? rows : rows.slice(0, PAGE_ROWS);
  const loading = changes === null;
  const filtered = state.kind !== "all" || state.category !== null;

  const countLine = loading
    ? null
    : rows.length === 0
      ? "No change matches these filters."
      : `${rows.length === 1 ? "1 change" : `${rows.length} changes`}${state.category ? ` in ${state.category}` : ""}${
          state.kind !== "all" ? `, ${FILTER_LABELS[state.kind].toLowerCase()}` : ""
        }, ${state.sort === "when" ? (state.descending ? "newest first" : "oldest first") : state.sort === "unit" ? (state.descending ? "largest increase first" : "largest decrease first") : state.descending ? "Z to A" : "A to Z"}.`;

  return (
    <section className="tool wide" id="changes" aria-labelledby="ch-h">
      <h2 id="ch-h">Every change</h2>
      <p className="tool-intro">
        Each published change, with the listed sizes and shelf prices exactly as recorded.
      </p>
      <div className="ch-controls">
        <div className="seg" role="group" aria-label="Kind of change">
          {FILTER_ORDER.map((kind: FeedKind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={state.kind === kind}
              onClick={() => update({ kind })}
              disabled={loading}
            >
              {FILTER_LABELS[kind]} <span>{loading ? "" : byKind[kind]}</span>
            </button>
          ))}
        </div>
        <label className="cat-sel">
          <span>Category</span>
          <select value={state.category ?? ""} onChange={(event) => update({ category: event.target.value || null })} disabled={loading}>
            <option value="">All categories</option>
            {categoryNames.map((name) => (
              <option key={name} value={name}>
                {name} ({categoryCounts.get(name) ?? 0})
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="ch-count" aria-live="polite">
        {countLine ?? <SkLine width={220} height={12} />}
      </p>
      <table className="ch-table">
        <caption className="sr-only">Published changes</caption>
        <thead>
          <tr>
            <SortHeader label="Product" column="product" state={state} onSort={onSort} />
            <th scope="col">
              <span className="th-l">Listed size</span>
            </th>
            <th scope="col">
              <span className="th-l">Shelf price</span>
            </th>
            <SortHeader label="Price per unit" column="unit" state={state} onSort={onSort} />
            <SortHeader label="When" column="when" state={state} onSort={onSort}>
              <sup>
                <a href="#fn3" id="r3" aria-label="Note 3">
                  3
                </a>
              </sup>
            </SortHeader>
          </tr>
        </thead>
        <tbody>
          {loading
            ? [0, 1, 2, 3, 4].map((i) => (
                <tr key={i} className="ch-sk" aria-hidden="true">
                  <th scope="row" className="c-prod">
                    <SkLine width="80%" height={15} />
                    <SkLine width="40%" height={12} />
                  </th>
                  <td className="c-size">
                    <SkLine width="60%" height={15} />
                  </td>
                  <td className="c-price">
                    <SkLine width="70%" height={15} />
                  </td>
                  <td className="c-unit">
                    <SkLine width="90%" height={15} />
                  </td>
                  <td className="c-when">
                    <SkLine width={80} height={15} />
                  </td>
                </tr>
              ))
            : shown.map((change) => <Row key={change.id} change={change} onOpen={openProduct} />)}
          {!loading && rows.length === 0 ? (
            <tr className="ch-empty">
              <td colSpan={5}>
                No change matches these filters.{" "}
                {filtered ? (
                  <button type="button" className="pl" onClick={() => setParams(serializeTableState(DEFAULT_STATE, params))}>
                    Show every change
                  </button>
                ) : null}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {!loading && rows.length > PAGE_ROWS && !showAll ? (
        <button type="button" className="more" onClick={() => setShowAll(true)}>
          Show all {rows.length}
        </button>
      ) : null}
    </section>
  );
}
