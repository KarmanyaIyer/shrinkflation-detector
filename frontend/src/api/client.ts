import { request } from "./http";
import type {
  AskRequest,
  AskResponse,
  BudgetOut,
  CategoryCount,
  ChangeList,
  FeedKind,
  ProductDetail,
  ProductSearchResult,
  Stats,
} from "./types";

export const PAGE_SIZE = 30;

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

export function getChanges(params: ChangesParams, signal?: AbortSignal): Promise<ChangeList> {
  const query = new URLSearchParams({
    kind: params.kind,
    limit: String(params.limit ?? PAGE_SIZE),
    offset: String(params.offset ?? 0),
  });
  if (params.category) query.set("category", params.category);
  return request<ChangeList>(`/changes?${query.toString()}`, { signal });
}

export function searchProducts(q: string, signal?: AbortSignal): Promise<ProductSearchResult> {
  const query = new URLSearchParams({ q });
  return request<ProductSearchResult>(`/products?${query.toString()}`, { signal });
}

export function getProduct(id: string, signal?: AbortSignal): Promise<ProductDetail> {
  return request<ProductDetail>(`/products/${encodeURIComponent(id)}`, { signal });
}

export function getAskBudget(signal?: AbortSignal): Promise<BudgetOut> {
  return request<BudgetOut>("/ask/budget", { signal });
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
