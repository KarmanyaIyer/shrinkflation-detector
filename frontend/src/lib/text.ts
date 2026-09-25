// Text helpers for names that come straight from the retailer's catalog.

// Trademark marks (also spelled "(R)" and "(TM)" in some catalog text) and promotional
// suffixes that make a name harder to read in prose.
const NOISE = /[®™©]|\((?:R|TM)\)|\bBIG DEAL!?/gi;

export function cleanName(name: string): string {
  return name.replace(NOISE, "").replace(/\s+/g, " ").trim();
}

// "REESE'S" reads as "Reese's" and "M&M'S" as "M&M's". Each run of letters keeps its first
// letter and lowers the rest; a short run after an apostrophe ("'S") or a run after a digit
// ("10CT") is lowered whole. Short all-caps words such as "ONE" or "BBQ" are left alone.
function unshout(word: string): string {
  if (word.length <= 3 || word !== word.toUpperCase() || !/[A-Z]/.test(word)) return word;
  return word.replace(/[A-Z]+/g, (run: string, at: number) => {
    const before = word.charAt(at - 1);
    if (/[0-9]/.test(before) || (/['’]/.test(before) && run.length <= 2)) return run.toLowerCase();
    return run.charAt(0) + run.slice(1).toLowerCase();
  });
}

// The full name as it reads in running text: marks dropped, shouted words settled.
export function displayName(name: string): string {
  return cleanName(name).split(" ").map(unshout).join(" ");
}

// Names longer than this are called by their brand in running prose when that is unambiguous.
export const PROSE_NAME_MAX = 32;

// The name to use in running prose. A long name that contains its brand as whole words is
// called by the brand, spelled as it appears in the name, when no name in `others` contains
// the brand too; otherwise the full display name. "General Mills REESE'S PUFFS Chocolatey
// Peanut Butter Cereal" with brand "Reese's Puffs" becomes "Reese's Puffs", while a store brand
// shared by many products keeps the full name.
export function proseName(
  name: string,
  brand: string | null | undefined,
  others: readonly string[] = [],
  max = PROSE_NAME_MAX,
): string {
  const full = displayName(name);
  const cleanBrand = brand ? cleanName(brand) : "";
  if (full.length <= max || !cleanBrand) return full;
  const body = escapeRegExp(cleanBrand).replace(/['’]/g, "['’]");
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, "iu");
  const match = pattern.exec(full);
  if (!match) return full;
  if (others.some((other) => pattern.test(displayName(other)))) return full;
  return match[0];
}

// Splits text into lines no wider than `max` by the given measure, breaking between words. A
// word wider than `max` gets a line of its own.
export function wrapText(text: string, max: number, measure: (text: string) => number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ").filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > max) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// wrapText with the lines evened out: the narrowest width that still needs no more lines, so a
// label never ends on one stranded word when it could split more evenly.
export function balancedWrap(text: string, max: number, measure: (text: string) => number): string[] {
  const lines = wrapText(text, max, measure);
  if (lines.length < 2) return lines;
  let lo = 0;
  let hi = max;
  for (let i = 0; i < 12; i += 1) {
    const mid = (lo + hi) / 2;
    if (wrapText(text, mid, measure).length <= lines.length) hi = mid;
    else lo = mid;
  }
  return wrapText(text, hi, measure);
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A pattern that matches a product name as a model tends to write it: marks dropped, any
// whitespace, case ignored. Names shorter than three words also allow the words to run together.
export function looseNamePattern(name: string): RegExp | null {
  const words = cleanName(name)
    .split(" ")
    .filter(Boolean)
    .map((word) => escapeRegExp(word).replace(/['’]/g, "['’]"));
  if (words.length === 0) return null;
  return new RegExp(words.join("[\\s®™©]*"), "i");
}

export interface TextRun {
  text: string;
  productId?: string;
}

// Splits `text` into runs, marking the first occurrence of each product name so the caller can
// turn it into a control. Longer names are matched first so a brand is not linked inside a
// longer product name.
export function linkNames(text: string, products: { id: string; name: string }[]): TextRun[] {
  const hits: { start: number; end: number; id: string }[] = [];
  const sorted = [...products].sort((a, b) => b.name.length - a.name.length);
  for (const product of sorted) {
    const pattern = looseNamePattern(product.name);
    if (!pattern) continue;
    const match = pattern.exec(text);
    if (!match) continue;
    const start = match.index;
    const end = start + match[0].length;
    if (hits.some((hit) => start < hit.end && end > hit.start)) continue;
    hits.push({ start, end, id: product.id });
  }
  hits.sort((a, b) => a.start - b.start);
  const runs: TextRun[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start > cursor) runs.push({ text: text.slice(cursor, hit.start) });
    runs.push({ text: text.slice(hit.start, hit.end), productId: hit.id });
    cursor = hit.end;
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor) });
  return runs;
}

// Joins items as prose: "a", "a and b", "a, b and c".
export function joinProse(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
