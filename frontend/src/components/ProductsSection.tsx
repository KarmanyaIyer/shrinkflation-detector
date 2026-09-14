import { useState } from "react";
import { Link } from "react-router";
import { getCatalog } from "../api/client";
import type { CategoryCount, Stats } from "../api/types";
import { formatInt, pluralize } from "../lib/format";
import { useApi, useDebouncedValue, type ApiState, type AsyncState } from "../lib/useApi";
import { useReveal } from "../lib/useReveal";
import { CatalogTable } from "./CatalogTable";
import { Empty, LoadError, SkeletonRows } from "./Status";

const RESULT_LIMIT = 30;

export function ProductsSection({
  stats,
  categories,
}: {
  stats: AsyncState<Stats>;
  categories: ApiState<CategoryCount[]>;
}) {
  const ref = useReveal<HTMLElement>();
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 250);
  const searching = debounced.length >= 2;
  const results = useApi((signal) => getCatalog({ q: debounced, limit: RESULT_LIMIT }, signal), [debounced], {
    enabled: searching,
  });

  const title =
    stats.status === "ok"
      ? `${formatInt(stats.data.products_tracked)} products in ${formatInt(stats.data.categories)} categories`
      : "Tracked products";

  return (
    <section className="section wrap" id="products" ref={ref} aria-labelledby="products-title">
      <div className="section-head">
        <h2 id="products-title">{title}</h2>
        <label className="search-wrap">
          <span className="sr-only">Search products</span>
          <input
            type="search"
            className="search"
            placeholder="Search by name or brand"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
          />
        </label>
      </div>

      {searching ? (
        results.status === "loading" ? (
          <SkeletonRows rows={4} cols={4} />
        ) : results.status === "error" ? (
          <LoadError what="products" error={results.error} retry={results.reload} />
        ) : results.data.items.length === 0 ? (
          <Empty title={`No products match "${debounced}".`} />
        ) : (
          <>
            <CatalogTable items={results.data.items} />
            {results.data.total > results.data.items.length ? (
              <p className="more-note">
                Showing {formatInt(results.data.items.length)} of {pluralize(results.data.total, "match", "matches")}.{" "}
                Narrow the search to see the rest.
              </p>
            ) : null}
          </>
        )
      ) : categories.status === "error" ? (
        <LoadError what="categories" error={categories.error} retry={categories.reload} />
      ) : categories.status === "loading" ? (
        <SkeletonRows rows={4} cols={3} />
      ) : (
        <ul className="cats">
          {categories.data.map((entry) => (
            <li key={entry.category}>
              <Link className="cat" to={`/products?category=${encodeURIComponent(entry.category)}`}>
                <span className="cat-name">{entry.category}</span>
                <span className="cat-n">
                  {formatInt(entry.products)}
                  {entry.changes > 0 ? <span className="cat-c">{pluralize(entry.changes, "change")}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
