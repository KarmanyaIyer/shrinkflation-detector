import { useState } from "react";
import { Link } from "react-router";
import { PAGE_SIZE, getCatalog } from "../api/client";
import type { CatalogItem, CategoryCount } from "../api/types";
import { formatDate, formatInt, formatMoney, formatUnitPrice, pluralize } from "../lib/format";
import { useApi, useDebouncedValue, type AsyncState } from "../lib/useApi";
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

// One row per product with its current state from the catalog endpoint. The changes cell
// stays empty at zero so products that changed stand out.
export function CatalogLedger({ items }: { items: CatalogItem[] }) {
  return (
    <table className="ledger products stacked">
      <colgroup>
        <col />
        <col className="c-size" />
        <col className="c-price" />
        <col className="c-unit" />
        <col className="c-chg" />
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
          <th scope="col" className="num">
            Changes
          </th>
          <th scope="col">Tracked since</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const current = item.current;
          return (
            <LinkRow key={item.product.id} to={`/products/${item.product.id}`}>
              <ProductCell product={item.product} />
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
              <td className="num" data-label="Changes">
                {item.changes > 0 ? formatInt(item.changes) : ""}
              </td>
              <td className="mono-cell" data-label="Tracked since">
                {formatDate(item.first_seen_at) ?? ""}
              </td>
            </LinkRow>
          );
        })}
      </tbody>
    </table>
  );
}

interface MoreState {
  key: string;
  items: CatalogItem[];
  loading: boolean;
  error: string | null;
}

// Paged catalog listing for a category, a search query, or a search within a category.
function PagedCatalog({ q, category }: { q?: string; category?: string }) {
  const filterKey = `${category ?? ""}|${q ?? ""}`;
  const firstPage = useApi(
    (signal) => getCatalog({ q, category, limit: PAGE_SIZE, offset: 0 }, signal),
    [filterKey],
  );
  const [more, setMore] = useState<MoreState>({ key: "", items: [], loading: false, error: null });

  if (firstPage.status === "loading") return <Loading what="products" />;
  if (firstPage.status === "error") {
    return <LoadError what="products" error={firstPage.error} retry={firstPage.reload} />;
  }

  const extra = more.key === filterKey ? more.items : [];
  const items = [...firstPage.data.items, ...extra];
  const total = firstPage.data.total;

  if (items.length === 0) {
    return (
      <p className="note">
        {q
          ? `No tracked products match "${q}"${category ? ` in ${category}` : ""}.`
          : "No products tracked in this category."}
      </p>
    );
  }

  async function loadMore() {
    const key = filterKey;
    const offset = items.length;
    setMore((prev) => ({ key, items: prev.key === key ? prev.items : [], loading: true, error: null }));
    try {
      const page = await getCatalog({ q, category, limit: PAGE_SIZE, offset });
      setMore((prev) => ({
        key,
        items: [...(prev.key === key ? prev.items : []), ...page.items],
        loading: false,
        error: null,
      }));
    } catch (error) {
      setMore((prev) => ({ ...prev, loading: false, error: error instanceof Error ? error.message : "Request failed." }));
    }
  }

  return (
    <>
      {q ? (
        <p className="results-count">
          {pluralize(total, "product")} {total === 1 ? "matches" : "match"} "{q}"
          {category ? ` in ${category}` : ""}
        </p>
      ) : null}
      <CatalogLedger items={items} />
      {items.length < total ? (
        <div className="ledger-more">
          <button type="button" className="btn-text" onClick={() => void loadMore()} disabled={more.loading}>
            {more.loading ? "Loading" : "Show more"}
          </button>
          <span className="count">
            {items.length} of {formatInt(total)} shown
          </span>
          {more.error ? <span className="error-inline">{more.error}</span> : null}
        </div>
      ) : null}
    </>
  );
}

function Categories({ state }: { state: Loadable<CategoryCount[]> }) {
  if (state.status === "loading") return <Loading what="categories" />;
  if (state.status === "error") return <LoadError what="categories" error={state.error} retry={state.reload} />;
  return <CategoryLedger categories={state.data} />;
}

interface Props {
  categories: Loadable<CategoryCount[]>;
  heading?: string;
  category?: string;
}

// Search box over tracked products. Before a query, lists categories with counts, or the
// chosen category's products when one is given. A query searches within that scope.
export function TrackedProducts({ categories, heading, category }: Props) {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 250);
  const active = debounced.length >= 2 ? debounced : "";
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
        placeholder={category ? `Search within ${category}` : "Search by product name or brand"}
        aria-label="Search tracked products"
        autoComplete="off"
        spellCheck={false}
      />
      <div className="results">
        {active || category ? (
          <PagedCatalog q={active || undefined} category={category} />
        ) : (
          <Categories state={categories} />
        )}
      </div>
    </section>
  );
}
