import { request } from "./http";
import type {
  AskRequest,
  AskResponse,
  CategoryCount,
  ChangeList,
  ChangeOut,
  FeedKind,
  FieldOut,
  ProductDetail,
  Stats,
} from "./types";

// The API caps a page at 100.
export const PAGE_SIZE = 100;

export interface ChangesParams {
  kind: FeedKind;
  category?: string | null;
  limit?: number;
  offset?: number;
}

export function getStats(signal?: AbortSignal): Promise<Stats> {
  return request<Stats>("/stats", { signal });
}

export function getCategories(signal?: AbortSignal): Promise<CategoryCount[]> {
  return request<CategoryCount[]>("/categories", { signal });
}

export function getField(signal?: AbortSignal): Promise<FieldOut> {
  return request<FieldOut>("/field", { signal });
}

export function getChanges(params: ChangesParams, signal?: AbortSignal): Promise<ChangeList> {
  const query = new URLSearchParams({
    kind: params.kind,
    limit: String(params.limit ?? PAGE_SIZE),
    offset: String(params.offset ?? 0),
  });
  if (params.category) query.set("category", params.category);
  return request<ChangeList>(`/changes?${query.toString()}`, { signal });
}

// Every published change, paging until the total is reached. The story and the table both
// work on the full list, so one load serves both.
export async function getAllChanges(signal?: AbortSignal): Promise<ChangeOut[]> {
  const items: ChangeOut[] = [];
  let total = Number.POSITIVE_INFINITY;
  while (items.length < total) {
    const page = await getChanges({ kind: "all", offset: items.length }, signal);
    total = page.total;
    if (page.items.length === 0) break;
    items.push(...page.items);
  }
  return items;
}

export function getProduct(id: string, signal?: AbortSignal): Promise<ProductDetail> {
  return request<ProductDetail>(`/products/${encodeURIComponent(id)}`, { signal });
}

export function ask(question: string, signal?: AbortSignal): Promise<AskResponse> {
  const body: AskRequest = { question };
  return request<AskResponse>("/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}
