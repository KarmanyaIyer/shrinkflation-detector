import { useState } from "react";
import { Link } from "react-router";
import { searchProducts } from "../api/client";
import type { CategoryCount, ProductSearchResult, ProductSummary } from "../api/types";
import { formatDate, formatInt, formatMoney, formatUnitPrice, pluralize } from "../lib/format";
import { useApi, useDebouncedValue, type AsyncState } from "../lib/useApi";
import { useProductDetails } from "../lib/useProductDetails";
import { LinkRow } from "./LinkRow";
import { ProductCell } from "./ProductCell";
import { Loading, LoadError } from "./Status";

type Loadable<T> = AsyncState<T> & { reload: () => void };

export function CategoryLedger({ categories }: { categories: CategoryCount[] }) {
  return (
    <table className="ledger categories">
      <colgroup>
        <col />
        <col className="c-count" />
        <col className="c-count" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">Category</th>
          <th scope="col" className="num">
            Products
          </th>
          <th scope="col" className="num">
            Changes
          </th>
        </tr>
      </thead>
      <tbody>
        {categories.map((c) => {
          const to = `/products?category=${encodeURIComponent(c.category)}`;
          return (
            <LinkRow key={c.category} to={to}>
              <td>
                <Link to={to} className="row-link">
                  {c.category}
                </Link>
              </td>
              <td className="num">{formatInt(c.products)}</td>
              <td className="num">{formatInt(c.changes)}</td>
            </LinkRow>
          );
        })}
      </tbody>
    </table>
  );
}

// Search results only carry the product summary, so the current state of each product is
// loaded from the detail endpoint (at most 20 rows, four at a time, cached per session).
export function ProductResults({ items, query }: { items: ProductSummary[]; query: string }) {
  const { details, failed } = useProductDetails(items.map((p) => p.id));
  if (items.length === 0) {
    return <p className="note">No tracked products match "{query}".</p>;
  }
  return (
    <>
      <p className="results-count">
        {pluralize(items.length, "product")} match "{query}"
        {items.length >= 20 ? ", showing the first 20" : ""}
      </p>
      <table className="ledger products stacked">
        <colgroup>
          <col />
          <col className="c-size" />
          <col className="c-price" />
          <col className="c-unit" />
          <col className="c-since" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col" className="num">
              Current size
            </th>
            <th scope="col" className="num">
              Regular price
            </th>
            <th scope="col" className="num">
              Unit price
            </th>
            <th scope="col">Tracked since</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => {
            const detail = details[p.id];
            const current = detail?.current;
            return (
              <LinkRow key={p.id} to={`/products/${p.id}`}>
                <ProductCell product={p} />
                <td className="num" data-label="Current size">
                  {current?.size_text ?? ""}
                </td>
                <td className="num" data-label="Regular price">
                  {formatMoney(current?.price_regular) ?? ""}
                </td>
                <td className="num" data-label="Unit price">
                  {formatUnitPrice(current?.unit_price?.value, current?.unit_price?.unit) ??
                    (current ? "not available" : "")}
                </td>
                <td className="mono-cell" data-label="Tracked since">
                  {detail ? (formatDate(detail.first_seen_at) ?? "") : ""}
                </td>
              </LinkRow>
            );
          })}
        </tbody>
      </table>
      {failed > 0 ? (
        <p className="results-note">Details for {pluralize(failed, "product")} could not be loaded.</p>
      ) : null}
    </>
  );
}

function SearchResults({ state, query }: { state: Loadable<ProductSearchResult | null>; query: string }) {
  if (state.status === "loading") return <Loading what="results" />;
  if (state.status === "error") return <LoadError what="results" error={state.error} retry={state.reload} />;
  if (!state.data) return null;
  return <ProductResults items={state.data.items} query={query} />;
}

function Categories({ state }: { state: Loadable<CategoryCount[]> }) {
  if (state.status === "loading") return <Loading what="categories" />;
  if (state.status === "error") return <LoadError what="categories" error={state.error} retry={state.reload} />;
  return <CategoryLedger categories={state.data} />;
}

interface Props {
  categories: Loadable<CategoryCount[]>;
  heading?: string;
  autoFocus?: boolean;
}

// Search box over all tracked products. Before a query, lists categories with counts.
export function TrackedProducts({ categories, heading, autoFocus = false }: Props) {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 250);
  const active = debounced.length >= 2 ? debounced : "";
  const results = useApi(
    (signal) => (active ? searchProducts(active, signal) : Promise.resolve(null)),
    [active],
  );
  const totalProducts = categories.data?.reduce((sum, c) => sum + c.products, 0) ?? 0;

  return (
    <section className={heading ? "section" : "section-plain"} aria-label={heading ? undefined : "Tracked products"}>
      {heading ? (
        <div className="section-head">
          <h2>{heading}</h2>
          {categories.data ? (
            <span className="count">
              {pluralize(totalProducts, "product")} · {pluralize(categories.data.length, "category", "categories")}
            </span>
          ) : null}
        </div>
      ) : null}
      <input
        type="search"
        className="input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by product name or brand"
        aria-label="Search tracked products"
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
      />
      <div className="results">
        {active ? <SearchResults state={results} query={active} /> : <Categories state={categories} />}
      </div>
    </section>
  );
}
