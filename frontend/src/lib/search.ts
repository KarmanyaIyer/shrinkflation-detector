import type { FieldProduct } from "../api/types";

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

// Splits a name into plain and matched pieces for highlighting.
export function highlightRuns(text: string, query: string): { text: string; hit: boolean }[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter((word) => word.length >= 2);
  if (words.length === 0) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const marks = new Array<boolean>(text.length).fill(false);
  for (const word of words) {
    let from = 0;
    while (from <= lower.length - word.length) {
      const at = lower.indexOf(word, from);
      if (at < 0) break;
      for (let i = at; i < at + word.length; i += 1) marks[i] = true;
      from = at + word.length;
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
