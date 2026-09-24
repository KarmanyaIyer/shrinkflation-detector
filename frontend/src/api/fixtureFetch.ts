// Answers API requests from the fixtures. Loaded only when VITE_USE_FIXTURES=1.
// VITE_FIXTURE_FAIL lists routes that should fail instead, for example "stats,ask" or
// "field,changes,product,categories", so error states can be seen and screenshotted.
import * as fx from "./fixtures";
import { ApiError } from "./http";
import { FEED_KIND_MEMBERS } from "../lib/kinds";
import { isFeedKind } from "./types";

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const FAIL = new Set(
  (import.meta.env.VITE_FIXTURE_FAIL ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean),
);

const BUDGET_USED = "You have used today's 10 questions. The budget resets at midnight UTC.";
const MODEL_BUDGET = "The daily model budget for this demo is used up. Please try again tomorrow.";
const MODEL_FAILED = "The assistant could not answer right now.";

async function answer(question: string) {
  // Typing a status code into the question shows that error state in the UI.
  if (question.includes("429")) throw new ApiError(429, BUDGET_USED);
  if (question.includes("503")) throw new ApiError(503, MODEL_BUDGET);
  if (question.includes("502")) throw new ApiError(502, MODEL_FAILED);
  if (question.includes("offline")) throw new ApiError(0, null);
  if (question.includes("slow")) await delay(70_000);
  return fx.askResponse;
}

function listChanges(params: URLSearchParams) {
  const kindParam = params.get("kind") ?? "shrink";
  const kind = isFeedKind(kindParam) ? kindParam : "shrink";
  const category = params.get("category");
  const limit = Math.min(100, Number(params.get("limit") ?? 30));
  const offset = Number(params.get("offset") ?? 0);
  const members = FEED_KIND_MEMBERS[kind];
  const matching = fx.changes.filter(
    (c) => members.includes(c.kind) && (!category || c.product.category === category),
  );
  return { items: matching.slice(offset, offset + limit), total: matching.length, limit, offset };
}

export async function fixtureRequest<T>(path: string, init: RequestInit): Promise<T> {
  await delay(path === "/field" ? 600 : 150);
  const url = new URL(path, "http://fixtures.invalid");
  const route = url.pathname;
  const params = url.searchParams;
  const name = route === "/ask" ? "ask" : route.startsWith("/products/") ? "product" : route.slice(1);
  if (FAIL.has(name)) throw new ApiError(503, "Service unavailable");
  let body: unknown;

  if (route === "/ask" && init.method === "POST") {
    await delay(1800);
    const payload = JSON.parse(String(init.body ?? "{}")) as { question?: string };
    body = await answer(payload.question ?? "");
  } else if (route === "/stats") {
    body = fx.stats;
  } else if (route === "/categories") {
    body = fx.categories;
  } else if (route === "/field") {
    body = fx.field;
  } else if (route === "/changes") {
    body = listChanges(params);
  } else if (route.startsWith("/products/")) {
    const id = decodeURIComponent(route.slice("/products/".length));
    const detail = fx.detailFor(id);
    if (!detail) throw new ApiError(404, "product not found");
    body = detail;
  } else {
    throw new ApiError(404, `No fixture for ${route}`);
  }
  return body as T;
}
