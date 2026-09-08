// Answers API requests from the fixtures. Loaded only when VITE_USE_FIXTURES=1.
import * as fx from "./fixtures";
import { ApiError } from "./http";
import { FEED_KIND_MEMBERS } from "../lib/kinds";
import { isFeedKind } from "./types";

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const BUDGET_USED = "You have used today's 10 questions. The budget resets at midnight UTC.";
const MODEL_BUDGET = "The daily model budget for this demo is used up. Please try again tomorrow.";
const MODEL_FAILED = "The assistant could not answer right now.";

function answer(question: string) {
  // Typing a status code into the question shows that error state in the UI.
  if (question.includes("429")) throw new ApiError(429, BUDGET_USED);
  if (question.includes("503")) throw new ApiError(503, MODEL_BUDGET);
  if (question.includes("502")) throw new ApiError(502, MODEL_FAILED);
  if (question.includes("offline")) throw new ApiError(0, null);
  return fx.askResponse;
}

function searchProducts(q: string) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const items = fx.allProducts.filter((p) =>
    words.every(
      (word) =>
        p.description.toLowerCase().includes(word) || (p.brand ?? "").toLowerCase().includes(word),
    ),
  );
  return { items };
}

function listChanges(params: URLSearchParams) {
  const kindParam = params.get("kind") ?? "shrink";
  const kind = isFeedKind(kindParam) ? kindParam : "shrink";
  const category = params.get("category");
  const limit = Number(params.get("limit") ?? 30);
  const offset = Number(params.get("offset") ?? 0);
  const members = FEED_KIND_MEMBERS[kind];
  const matching = fx.changes.filter(
    (c) => members.includes(c.kind) && (!category || c.product.category === category),
  );
  return { items: matching.slice(offset, offset + limit), total: matching.length, limit, offset };
}

export async function fixtureRequest<T>(path: string, init: RequestInit): Promise<T> {
  await delay(150);
  const url = new URL(path, "http://fixtures.invalid");
  const route = url.pathname;
  const params = url.searchParams;
  let body: unknown;

  if (route === "/ask" && init.method === "POST") {
    const payload = JSON.parse(String(init.body ?? "{}")) as { question?: string };
    body = answer(payload.question ?? "");
  } else if (route === "/ask/budget") {
    body = fx.budget;
  } else if (route === "/stats") {
    body = fx.stats;
  } else if (route === "/categories") {
    body = fx.categories;
  } else if (route === "/changes") {
    body = listChanges(params);
  } else if (route === "/products") {
    const q = params.get("q") ?? "";
    if (q.length < 2) throw new ApiError(422, "String should have at least 2 characters");
    body = searchProducts(q);
  } else if (route.startsWith("/products/")) {
    const id = decodeURIComponent(route.slice("/products/".length));
    const detail = fx.details[id];
    if (!detail) throw new ApiError(404, "product not found");
    body = detail;
  } else {
    throw new ApiError(404, `No fixture for ${route}`);
  }
  return body as T;
}
