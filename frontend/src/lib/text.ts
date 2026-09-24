// Text helpers for names that come straight from the retailer's catalog.

// Trademark marks and promotional suffixes that make a name harder to read in prose.
const NOISE = /[®™©]|\bBIG DEAL!?/gi;

export function cleanName(name: string): string {
  return name.replace(NOISE, "").replace(/\s+/g, " ").trim();
}

function unshout(word: string): string {
  // "REESE'S" reads as "Reese's"; short all-caps words such as "ONE" or "BBQ" are left alone.
  if (word.length > 3 && word === word.toUpperCase() && /[A-Z]/.test(word)) {
    return word.charAt(0) + word.slice(1).toLowerCase();
  }
  return word;
}

// The full name as it reads in running text: marks dropped, shouted words settled.
export function displayName(name: string): string {
  return cleanName(name).split(" ").map(unshout).join(" ");
}

// A short form of a product name for annotations: the cleaned name cut at a word boundary
// once it passes `max` characters, with an ellipsis when something was cut.
export function shortName(name: string, max = 28): string {
  const words = cleanName(name).split(" ").map(unshout);
  let out = "";
  for (const word of words) {
    const next = out ? `${out} ${word}` : word;
    if (out && next.length > max) return `${out}…`;
    out = next;
  }
  return out;
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
