import { useId, useMemo, useState } from "react";
import type { CategoryCount, FieldProduct } from "../api/types";
import { formatInt, formatMoney } from "../lib/format";
import { kindDirection, kindLabel } from "../lib/kinds";
import { useOpenProduct } from "../lib/drawerRoute";
import { useDebouncedValue } from "../lib/useApi";
import { highlightRuns, SEARCH_LIMIT, searchProducts } from "../lib/search";
import { displayName } from "../lib/text";

function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightRuns(text, query).map((run, i) => (run.hit ? <mark key={i}>{run.text}</mark> : <span key={i}>{run.text}</span>))}
    </>
  );
}

export function FindSection({ products, categories }: { products: FieldProduct[] | null; categories: CategoryCount[] | null }) {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 120);
  const openProduct = useOpenProduct();
  const inputId = useId();
  const countId = useId();

  const result = useMemo(() => (products ? searchProducts(products, debounced) : { total: 0, items: [] }), [products, debounced]);
  const suggestions = useMemo(() => {
    const cats = [...(categories ?? [])].sort((a, b) => b.products - a.products).slice(0, 2).map((c) => c.category);
    const changed = (products ?? []).find((p) => p.change && p.brand)?.brand;
    return [...cats, ...(changed ? [changed] : [])];
  }, [categories, products]);

  const active = debounced.trim().length > 0;
  const count = !products
    ? ""
    : !active
      ? ""
      : result.total === 0
        ? `No product matches “${debounced.trim()}”.`
        : result.total > SEARCH_LIMIT
          ? `${SEARCH_LIMIT} of ${formatInt(result.total)} matches. Add a word to narrow it.`
          : `${result.total === 1 ? "1 match" : `${result.total} matches`}.`;

  return (
    <section className="tool" id="search" aria-labelledby="find-h">
      <h2 id="find-h">Find a product</h2>
      <div className="find-box">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="m13 13 5 5" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        <label className="sr-only" htmlFor={inputId}>
          Search products
        </label>
        <input
          id={inputId}
          type="search"
          placeholder={products ? `Search ${formatInt(products.length)} products by name, brand, or category` : "Loading the product list"}
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={!products}
          aria-describedby={countId}
        />
      </div>
      <p className="find-count" id={countId} aria-live="polite">
        {count ||
          (products && !active && suggestions.length ? (
            <>
              Try
              {suggestions.map((word) => (
                <button key={word} type="button" onClick={() => setQuery(word)}>
                  {word}
                </button>
              ))}
            </>
          ) : null)}
      </p>
      <ul className="find-list">
        {result.items.map((product) => {
          const dir = kindDirection(product.change);
          return (
            <li key={product.id}>
              <button type="button" className="fr" onClick={(event) => openProduct(product.id, event.currentTarget)}>
                <span className="fr-name">
                  <Highlight text={displayName(product.name)} query={debounced} />
                </span>
                <span className="fr-size">{product.size ?? ""}</span>
                <span className="fr-price">{formatMoney(product.price) ?? ""}</span>
                <span className="fr-meta">
                  <Highlight text={product.category} query={debounced} />
                  {product.change ? (
                    <>
                      <i className={`kd ${dir === "more" ? "m" : "l"}`} aria-hidden="true" />
                      {kindLabel(product.change)}
                    </>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
