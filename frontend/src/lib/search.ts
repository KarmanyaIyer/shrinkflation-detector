import type { FieldProduct } from "../api/types";
import { displayName } from "./text";

export const SEARCH_LIMIT = 10;

export interface SearchResult {
  total: number;
  items: FieldProduct[];
}

// Every word typed must appear in the name, brand, or category. Products with a recorded
// change come first, then alphabetical, so the interesting hits surface in a short list.
export function searchProducts(products: FieldProduct[], query: string, limit = SEARCH_LIMIT): SearchResult {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { total: 0, items: [] };
  const matches = products.filter((product) => {
    const hay = `${product.name} ${product.brand ?? ""} ${product.category}`.toLowerCase();
    return words.every((word) => hay.includes(word));
  });
  matches.sort((a, b) => (b.change ? 1 : 0) - (a.change ? 1 : 0) || a.name.localeCompare(b.name));
  return { total: matches.length, items: matches.slice(0, limit) };
}

// Splits a name into plain and matched pieces for highlighting. Display names carry an
// invisible word joiner after a hyphen between digits ("9-11"); matching skips it, and a joiner
// inside a match is marked with it.
export function highlightRuns(text: string, query: string): { text: string; hit: boolean }[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter((word) => word.length >= 2);
  if (words.length === 0) return [{ text, hit: false }];
  const at: number[] = [];
  let plain = "";
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\u2060") continue;
    at.push(i);
    plain += text[i];
  }
  const lower = plain.toLowerCase();
  const marks = new Array<boolean>(text.length).fill(false);
  for (const word of words) {
    let from = 0;
    while (from <= lower.length - word.length) {
      const found = lower.indexOf(word, from);
      if (found < 0) break;
      for (let i = at[found]!; i <= at[found + word.length - 1]!; i += 1) marks[i] = true;
      from = found + word.length;
    }
  }
  const runs: { text: string; hit: boolean }[] = [];
  let start = 0;
  for (let i = 1; i <= text.length; i += 1) {
    if (i === text.length || marks[i] !== marks[start]) {
      runs.push({ text: text.slice(start, i), hit: marks[start]! });
      start = i;
    }
  }
  return runs;
}

// True when some typed word matched only the brand, so the result row has to show the brand
// for the reader to see why it matched.
export function brandOnlyMatch(product: FieldProduct, query: string): boolean {
  const brand = (product.brand ?? "").toLowerCase();
  if (!brand) return false;
  const shown = `${displayName(product.name)} ${product.category}`.toLowerCase();
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length >= 2)
    .some((word) => brand.includes(word) && !shown.includes(word));
}

// Up to three searches worth trying: the brands of the products the article names, in the
// article's order, kept only when the search returns a short list (one to SEARCH_LIMIT hits).
export function searchSuggestions(products: FieldProduct[], featured: string[], most = 3): string[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  const out: string[] = [];
  for (const id of featured) {
    const brand = byId.get(id)?.brand?.trim();
    if (!brand || out.some((word) => word.toLowerCase() === brand.toLowerCase())) continue;
    const total = searchProducts(products, brand).total;
    if (total >= 1 && total <= SEARCH_LIMIT) out.push(brand);
    if (out.length === most) break;
  }
  return out;
}
