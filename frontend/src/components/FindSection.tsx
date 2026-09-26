import { useId, useMemo, useState } from "react";
import type { FieldProduct } from "../api/types";
import { formatInt, formatMoney } from "../lib/format";
import { kindDirection, kindLabel } from "../lib/kinds";
import { useDebouncedValue } from "../lib/useApi";
import { brandOnlyMatch, highlightRuns, SEARCH_LIMIT, searchProducts, searchSuggestions } from "../lib/search";
import { displayName } from "../lib/text";
import { noBreak } from "./NoBreak";
import { ProductLink } from "./ProductLink";

function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightRuns(text, query).map((run, i) => (run.hit ? <mark key={i}>{noBreak(run.text)}</mark> : <span key={i}>{noBreak(run.text)}</span>))}
    </>
  );
}

// `featured` lists the products the article names, most interesting first; their brands are
// offered as searches.
export function FindSection({ products, featured }: { products: FieldProduct[] | null; featured: string[] }) {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 120);
  const inputId = useId();
  const countId = useId();

  const result = useMemo(() => (products ? searchProducts(products, debounced) : { total: 0, items: [] }), [products, debounced]);
  const suggestions = useMemo(() => (products ? searchSuggestions(products, featured) : []), [products, featured]);

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
          placeholder={products ? "Name, brand or category" : "Loading the product list"}
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={!products}
          aria-describedby={countId}
        />
      </div>
      <p className="find-count" id={countId} aria-live="polite">
        {count}
      </p>
      {/* Outside the live region, so the count is announced alone. */}
      {products && !active && suggestions.length ? (
        <div className="find-count" role="group" aria-label="Suggestions">
          Try
          {suggestions.map((word) => (
            <button key={word} type="button" onClick={() => setQuery(word)}>
              {word}
            </button>
          ))}
        </div>
      ) : null}
      <ul className="find-list">
        {result.items.map((product) => {
          const dir = kindDirection(product.change);
          return (
            <li key={product.id}>
              <ProductLink id={product.id} className="fr">
                <span className="fr-name">
                  <Highlight text={displayName(product.name)} query={debounced} />
                </span>
                <span className="fr-size">{product.size ?? ""}</span>
                <span className="fr-price">{formatMoney(product.price) ?? ""}</span>
                <span className="fr-meta">
                  <Highlight text={product.category} query={debounced} />
                  {product.brand && brandOnlyMatch(product, debounced) ? (
                    <span className="fr-brand">
                      Brand <Highlight text={product.brand} query={debounced} />
                    </span>
                  ) : null}
                  {product.change ? (
                    <>
                      <i className={`kd ${dir === "more" ? "m" : "l"}`} aria-hidden="true" />
                      {kindLabel(product.change)}
                    </>
                  ) : null}
                </span>
              </ProductLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
