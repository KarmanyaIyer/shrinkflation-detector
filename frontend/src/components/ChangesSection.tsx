import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { PAGE_SIZE, getChanges } from "../api/client";
import { FEED_KINDS, isFeedKind, type CategoryCount, type ChangeOut, type FeedKind, type Stats } from "../api/types";
import { formatDateShort, formatInt } from "../lib/format";
import { EMPTY_TITLES, FILTER_LABELS } from "../lib/kinds";
import { useApi, type AsyncState } from "../lib/useApi";
import { useReveal } from "../lib/useReveal";
import { ChangesTable } from "./ChangesTable";
import { Empty, LoadError, SkeletonRows } from "./Status";

function countFor(stats: Stats, kind: FeedKind): number {
  switch (kind) {
    case "shrink":
      return stats.shrink_count;
    case "grow":
      return stats.grow_count;
    case "price_increase":
      return stats.price_increase_count;
    case "price_decrease":
      return stats.price_decrease_count;
    default:
      return stats.changes_published;
  }
}

// The tab to open on: the URL's kind if it names one, otherwise size decreases when any have
// been published and everything otherwise, so the page never opens on an empty table.
export function defaultKind(param: string | null, stats: Stats | undefined): FeedKind {
  if (isFeedKind(param)) return param;
  if (!stats || stats.shrink_count > 0) return "shrink";
  return "all";
}

export function ChangesSection({
  stats,
  categories,
}: {
  stats: AsyncState<Stats>;
  categories: AsyncState<CategoryCount[]>;
}) {
  const ref = useReveal<HTMLElement>();
  const [params] = useSearchParams();
  const ready = stats.status !== "loading";
  const [kind, setKind] = useState<FeedKind | null>(null);
  const [category, setCategory] = useState<string | null>(params.get("category"));
  const [extra, setExtra] = useState<ChangeOut[]>([]);
  const [more, setMore] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    if (ready && kind === null) setKind(defaultKind(params.get("kind"), stats.data));
  }, [ready, kind, params, stats.data]);

  const activeKind = kind ?? "shrink";
  const first = useApi(
    (signal) => getChanges({ kind: activeKind, category, offset: 0 }, signal),
    [activeKind, category],
    { enabled: kind !== null },
  );

  useEffect(() => {
    setExtra([]);
    setMore("idle");
  }, [activeKind, category]);

  async function loadMore() {
    if (first.status !== "ok") return;
    setMore("loading");
    try {
      const page = await getChanges({ kind: activeKind, category, offset: first.data.items.length + extra.length });
      setExtra((current) => [...current, ...page.items]);
      setMore("idle");
    } catch {
      setMore("error");
    }
  }

  const items = first.status === "ok" ? [...first.data.items, ...extra] : [];
  const total = first.status === "ok" ? first.data.total : null;
  const emptyNote =
    stats.status === "ok" && stats.data.tracking_since
      ? `Tracking started ${formatDateShort(stats.data.tracking_since)}. A change is published once a new size or price has been seen on a later check.`
      : "A change is published once a new size or price has been seen on a later check.";

  return (
    <section className="section wrap" id="changes" ref={ref} aria-labelledby="changes-title">
      <div className="section-head">
        <h2 id="changes-title">What changed</h2>
        {total !== null ? (
          <span className="section-count">
            {formatInt(total)} {total === 1 ? "change" : "changes"}
            {category ? ` in ${category}` : ""}
          </span>
        ) : null}
      </div>

      <div className="controls">
        <div className="seg" role="group" aria-label="Kind of change">
          {FEED_KINDS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={activeKind === option}
              onClick={() => setKind(option)}
              disabled={kind === null}
            >
              {FILTER_LABELS[option]}
              {stats.status === "ok" ? <span className="seg-n">{formatInt(countFor(stats.data, option))}</span> : null}
            </button>
          ))}
        </div>
        <label className="select-wrap">
          <span className="sr-only">Category</span>
          <select
            className="select"
            value={category ?? ""}
            onChange={(event) => setCategory(event.target.value || null)}
            aria-label="Category"
          >
            <option value="">All categories</option>
            {categories.status === "ok"
              ? categories.data.map((entry) => (
                  <option key={entry.category} value={entry.category}>
                    {entry.category}
                  </option>
                ))
              : null}
          </select>
        </label>
      </div>

      {first.status === "error" ? (
        <LoadError what="changes" error={first.error} retry={first.reload} />
      ) : first.status === "loading" ? (
        <SkeletonRows rows={5} cols={4} />
      ) : items.length === 0 ? (
        <Empty title={`${EMPTY_TITLES[activeKind].replace(/\.$/, "")}${category ? ` in ${category}` : ""}.`} note={emptyNote} />
      ) : (
        <>
          <ChangesTable items={items} showKind={activeKind === "all"} />
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
    </section>
  );
}
