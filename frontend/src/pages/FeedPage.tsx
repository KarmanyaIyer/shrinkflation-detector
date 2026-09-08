import { useState } from "react";
import { useOutletContext, useSearchParams } from "react-router";
import { PAGE_SIZE, getCategories, getChanges } from "../api/client";
import { FEED_KINDS, isFeedKind, type ChangeOut, type FeedKind } from "../api/types";
import { ChangesLedger } from "../components/ChangesLedger";
import type { OutletContext } from "../components/Layout";
import { Loading, LoadError } from "../components/Status";
import { TrackedProducts } from "../components/TrackedProducts";
import { formatDate, pluralize } from "../lib/format";
import { EMPTY_NOUNS, FILTER_LABELS } from "../lib/kinds";
import { useApi, usePageTitle } from "../lib/useApi";

function EmptyFeed({ kind, category, trackingSince }: { kind: FeedKind; category: string; trackingSince: string | null | undefined }) {
  const since = formatDate(trackingSince);
  return (
    <div className="empty">
      <p className="empty-title">
        No {EMPTY_NOUNS[kind]} recorded yet{category ? ` in ${category}` : ""}.
      </p>
      <p className="empty-fact">
        {since ? `Tracking started ${since}. ` : ""}
        Products are checked once a day, and a change is published only after the new size or price has
        been observed.
      </p>
    </div>
  );
}

interface MoreState {
  key: string;
  items: ChangeOut[];
  loading: boolean;
  error: string | null;
}

export function FeedPage() {
  usePageTitle("Feed");
  const { stats } = useOutletContext<OutletContext>();
  const [params, setParams] = useSearchParams();
  const kindParam = params.get("kind");
  const kind: FeedKind = isFeedKind(kindParam) ? kindParam : "shrink";
  const category = params.get("category") ?? "";
  const filterKey = `${kind}|${category}`;

  const firstPage = useApi(
    (signal) => getChanges({ kind, category: category || null, limit: PAGE_SIZE, offset: 0 }, signal),
    [kind, category],
  );
  const categories = useApi((signal) => getCategories(signal), []);
  const [more, setMore] = useState<MoreState>({ key: "", items: [], loading: false, error: null });

  const extra = more.key === filterKey ? more.items : [];
  const items = firstPage.status === "ok" ? [...firstPage.data.items, ...extra] : [];
  const total = firstPage.status === "ok" ? firstPage.data.total : 0;
  const hasMore = firstPage.status === "ok" && items.length < total;

  function update(next: { kind?: FeedKind; category?: string }) {
    const nextParams = new URLSearchParams(params);
    const nextKind = next.kind ?? kind;
    const nextCategory = next.category ?? category;
    if (nextKind === "shrink") nextParams.delete("kind");
    else nextParams.set("kind", nextKind);
    if (nextCategory) nextParams.set("category", nextCategory);
    else nextParams.delete("category");
    void setParams(nextParams, { replace: true });
  }

  async function loadMore() {
    const key = filterKey;
    const offset = items.length;
    setMore((prev) => ({ key, items: prev.key === key ? prev.items : [], loading: true, error: null }));
    try {
      const page = await getChanges({ kind, category: category || null, limit: PAGE_SIZE, offset });
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
      <div className="filters">
        <div className="seg" role="group" aria-label="Kind of change">
          {FEED_KINDS.map((k) => (
            <button key={k} type="button" aria-pressed={k === kind} onClick={() => update({ kind: k })}>
              {FILTER_LABELS[k]}
            </button>
          ))}
        </div>
        <div className="filters-right">
          <span className="count" aria-live="polite">
            {firstPage.status === "ok" ? pluralize(total, "change") : " "}
          </span>
          <select
            className="select"
            aria-label="Category"
            value={category}
            onChange={(event) => update({ category: event.target.value })}
          >
            <option value="">All categories</option>
            {categories.data?.map((c) => (
              <option key={c.category} value={c.category}>
                {c.category} ({c.products} products)
              </option>
            ))}
          </select>
        </div>
      </div>

      {firstPage.status === "loading" ? <Loading what="changes" /> : null}
      {firstPage.status === "error" ? (
        <LoadError what="changes" error={firstPage.error} retry={firstPage.reload} />
      ) : null}
      {firstPage.status === "ok" && items.length === 0 ? (
        <EmptyFeed kind={kind} category={category} trackingSince={stats.data?.tracking_since} />
      ) : null}
      {firstPage.status === "ok" && items.length > 0 ? (
        <>
          <ChangesLedger items={items} first="product" showKind={kind === "all"} />
          {hasMore ? (
            <div className="ledger-more">
              <button type="button" className="btn-text" onClick={() => void loadMore()} disabled={more.loading}>
                {more.loading ? "Loading" : "Show more"}
              </button>
              <span className="count">
                {items.length} of {total} shown
              </span>
              {more.error ? <span className="error-inline">{more.error}</span> : null}
            </div>
          ) : null}
        </>
      ) : null}

      <TrackedProducts categories={categories} heading="Tracked products" />
    </>
  );
}
