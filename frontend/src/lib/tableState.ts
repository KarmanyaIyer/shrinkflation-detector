// The change table's filters and sort, kept in the query string so a view can be linked.
import { isFeedKind, type ChangeOut, type FeedKind } from "../api/types";
import { unitChangePct } from "./changes";
import { FEED_KIND_MEMBERS } from "./kinds";

export type SortKey = "when" | "unit" | "product";

export interface TableState {
  kind: FeedKind;
  category: string | null;
  sort: SortKey;
  descending: boolean;
}

export const DEFAULT_STATE: TableState = { kind: "all", category: null, sort: "when", descending: true };

const SORT_KEYS: SortKey[] = ["when", "unit", "product"];

export function parseTableState(params: URLSearchParams): TableState {
  const kindParam = params.get("kind");
  const kind = isFeedKind(kindParam) ? kindParam : DEFAULT_STATE.kind;
  const category = params.get("category") || null;
  const sortParam = params.get("sort") ?? "";
  const descending = sortParam.startsWith("-") ? true : sortParam ? false : DEFAULT_STATE.descending;
  const key = sortParam.replace(/^-/, "");
  const sort = (SORT_KEYS as string[]).includes(key) ? (key as SortKey) : DEFAULT_STATE.sort;
  const isDefaultSort = sort === DEFAULT_STATE.sort && !sortParam;
  return { kind, category, sort, descending: isDefaultSort ? DEFAULT_STATE.descending : descending };
}

// Writes only what differs from the default, so the plain URL stays plain.
export function serializeTableState(state: TableState, base = new URLSearchParams()): URLSearchParams {
  const params = new URLSearchParams(base);
  if (state.kind === DEFAULT_STATE.kind) params.delete("kind");
  else params.set("kind", state.kind);
  if (state.category) params.set("category", state.category);
  else params.delete("category");
  if (state.sort === DEFAULT_STATE.sort && state.descending === DEFAULT_STATE.descending) params.delete("sort");
  else params.set("sort", `${state.descending ? "-" : ""}${state.sort}`);
  return params;
}

// The sort choices offered as one list where the column headers are hidden (phones). Each value
// is "<column>:<asc|desc>".
export const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "when:desc", label: "Newest first" },
  { value: "when:asc", label: "Oldest first" },
  { value: "unit:desc", label: "Largest increase first" },
  { value: "unit:asc", label: "Largest decrease first" },
  { value: "product:asc", label: "Product A to Z" },
  { value: "product:desc", label: "Product Z to A" },
];

export function sortValue(state: Pick<TableState, "sort" | "descending">): string {
  return `${state.sort}:${state.descending ? "desc" : "asc"}`;
}

export function parseSortValue(value: string): Pick<TableState, "sort" | "descending"> {
  const [key = "", order] = value.split(":");
  const sort = (SORT_KEYS as string[]).includes(key) ? (key as SortKey) : DEFAULT_STATE.sort;
  return { sort, descending: order === "desc" };
}

// The default direction when a column is first chosen: newest and largest first, names A to Z.
export function defaultDescending(sort: SortKey): boolean {
  return sort !== "product";
}

export function filterChanges(changes: ChangeOut[], state: Pick<TableState, "kind" | "category">): ChangeOut[] {
  const members = FEED_KIND_MEMBERS[state.kind];
  return changes.filter(
    (change) => members.includes(change.kind) && (!state.category || change.product.category === state.category),
  );
}

export function sortChanges(changes: ChangeOut[], state: Pick<TableState, "sort" | "descending">): ChangeOut[] {
  const sign = state.descending ? -1 : 1;
  const value = (change: ChangeOut) => unitChangePct(change) ?? 0;
  const magnitude = (change: ChangeOut) => Math.abs(value(change));
  return [...changes].sort((a, b) => {
    let order: number;
    if (state.sort === "when") {
      order =
        (a.after_seen_at ?? a.detected_at).localeCompare(b.after_seen_at ?? b.detected_at) ||
        magnitude(a) - magnitude(b);
    } else if (state.sort === "unit") {
      order = value(a) - value(b) || a.product.description.localeCompare(b.product.description);
    } else {
      order = a.product.description.localeCompare(b.product.description);
    }
    return order * sign || a.id - b.id;
  });
}

export function countByKind(changes: ChangeOut[]): Record<FeedKind, number> {
  const counts: Record<FeedKind, number> = { all: 0, shrink: 0, grow: 0, price_increase: 0, price_decrease: 0 };
  for (const change of changes) {
    for (const kind of Object.keys(counts) as FeedKind[]) {
      if (FEED_KIND_MEMBERS[kind].includes(change.kind)) counts[kind] += 1;
    }
  }
  return counts;
}
