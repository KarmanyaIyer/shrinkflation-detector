import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { PAGE_SIZE, getCatalog } from "../api/client";
import type { CatalogItem } from "../api/types";
import { CatalogTable } from "../components/CatalogTable";
import { Empty, LoadError, SkeletonRows } from "../components/Status";
import { formatInt, pluralize } from "../lib/format";
import { useApi, usePageTitle } from "../lib/useApi";

// Every tracked product in one category, from the category grid on the home page.
export function ProductsPage() {
  const [params] = useSearchParams();
  const category = params.get("category");
  usePageTitle(category);
  const first = useApi((signal) => getCatalog({ category, limit: PAGE_SIZE, offset: 0 }, signal), [category], {
    enabled: category !== null,
  });
  const [extra, setExtra] = useState<CatalogItem[]>([]);
  const [more, setMore] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    setExtra([]);
    setMore("idle");
  }, [category]);

  if (category === null) return <Navigate to="/#products" replace />;

  async function loadMore() {
    if (first.status !== "ok") return;
    setMore("loading");
    try {
      const page = await getCatalog({ category, limit: PAGE_SIZE, offset: first.data.items.length + extra.length });
      setExtra((current) => [...current, ...page.items]);
      setMore("idle");
    } catch {
      setMore("error");
    }
  }

  const items = first.status === "ok" ? [...first.data.items, ...extra] : [];
  const total = first.status === "ok" ? first.data.total : null;

  return (
    <div className="page wrap">
      <p className="crumb">
        <Link to="/#products">All categories</Link>
      </p>
      <div className="section-head">
        <h1>{category}</h1>
        {total !== null ? <span className="section-count">{pluralize(total, "product")}</span> : null}
      </div>
      {first.status === "loading" ? (
        <SkeletonRows rows={8} cols={4} />
      ) : first.status === "error" ? (
        <LoadError what="products" error={first.error} retry={first.reload} />
      ) : items.length === 0 ? (
        <Empty title={`No tracked products in ${category}.`} />
      ) : (
        <>
          <CatalogTable items={items} />
          {total !== null && items.length < total ? (
            <div className="more">
              <button type="button" className="btn btn-line" onClick={() => void loadMore()} disabled={more === "loading"}>
                {more === "loading" ? "Loading" : `Show ${formatInt(Math.min(PAGE_SIZE, total - items.length))} more`}
              </button>
              {more === "error" ? <span className="status-error">Could not load more. Try again.</span> : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
