// Text helpers for names that come straight from the retailer's catalog.

// Trademark marks (also spelled "(R)" and "(TM)" in some catalog text) and promotional
// suffixes that make a name harder to read in prose.
const NOISE = /[®™©]|\((?:R|TM)\)|\bBIG DEAL!?/gi;

export function cleanName(name: string): string {
  return name.replace(NOISE, "").replace(/\s+/g, " ").trim();
}

// Size units that follow a number: "32 OZ" reads "32 oz", "22.5 FL OZ" reads "22.5 fl oz".
const UNIT_WORDS = new Set(["OZ", "FL", "PK", "CT", "LB", "LBS", "GAL", "QT", "PT", "ML", "EA"]);
// Joining words lowered inside a shouted phrase: "LESS THAN 50% PEANUTS WITH SEA SALT".
const MINOR_WORDS = new Set(["a", "an", "and", "as", "at", "for", "in", "of", "on", "or", "than", "the", "to", "with"]);
// Short initialisms kept in capitals even inside a shouted phrase.
const KEEP_CAPS = new Set(["BBQ", "XL", "XXL", "GMO", "USA", "EZ", "M&M"]);
// A number with letters attached: "4PK", "10CT", "3D", "12X".
const NUMBER_LETTERS = /^([$]?\d[\d.,]*)([A-Z]+)([^A-Za-z]*)$/;

function letters(word: string): string {
  return word.replace(/[^A-Za-z]/g, "");
}

function shouted(word: string | null | undefined): boolean {
  if (!word) return false;
  const found = letters(word);
  return found.length > 0 && found === found.toUpperCase();
}

function isNumber(word: string | undefined): boolean {
  return word !== undefined && /^[$]?\d[\d.,/%]*$/.test(word);
}

// A word of three or more capitals with no vowel ("KBBQ", "GMCR", "SPF") is an initialism or
// an abbreviation, not a shouted word.
function initialism(word: string): boolean {
  const bare = letters(word);
  return bare.length >= 3 && !/[AEIOUY]/.test(bare) && !/['’]/.test(word);
}

// "REESE'S" reads as "Reese's" and "M&M'S" as "M&M's". Each run of letters keeps its first
// letter and lowers the rest; a short run after an apostrophe ("'S") or a size unit after a
// digit ("10CT") is lowered whole, and other letters after a digit ("3D") are kept.
function settle(word: string): string {
  return word.replace(/[A-Z]+/g, (run: string, at: number) => {
    const before = word.charAt(at - 1);
    if (/[0-9]/.test(before)) return UNIT_WORDS.has(run) ? run.toLowerCase() : run;
    if (/['’]/.test(before) && run.length <= 2) return run.toLowerCase();
    return run.charAt(0) + run.slice(1).toLowerCase();
  });
}

// The full name as it reads in running text: marks dropped, shouted words settled.
// Words of four or more characters in capitals are settled, except initialisms with no vowel
// ("KBBQ"). A short one ("ARM", "SEA") is settled only inside a shouted phrase: when most of
// the name's letters are capitals, or when a neighbouring word is a long shouted word ("ARM &
// HAMMER"). Otherwise it is taken for an initialism ("BBQ", "ONE", "XL") and left alone. Units
// after a number are lowered ("4PK", "32 OZ"); other letters after a number are kept ("3D").
export function displayName(name: string): string {
  const words = cleanName(name).split(" ");
  const all = letters(words.join(""));
  const mostlyCaps = all.length > 0 && all.replace(/[a-z]/g, "").length / all.length > 0.5;
  const neighbour = (i: number, step: number): string | null => {
    for (let j = i + step; j >= 0 && j < words.length; j += step) if (letters(words[j]!)) return words[j]!;
    return null;
  };
  const longShout = (word: string | null) => word !== null && shouted(word) && word.length > 3;
  const settled = words.map((word, i) => {
    if (!shouted(word)) return word;
    const bare = letters(word);
    const attached = NUMBER_LETTERS.exec(word);
    if (attached) return UNIT_WORDS.has(attached[2]!) ? `${attached[1]}${attached[2]!.toLowerCase()}${attached[3]}` : word;
    if (UNIT_WORDS.has(bare) && (isNumber(words[i - 1]) || (UNIT_WORDS.has(letters(words[i - 1] ?? "")) && isNumber(words[i - 2])))) {
      return word.toLowerCase();
    }
    const inPhrase = mostlyCaps || longShout(neighbour(i, -1)) || longShout(neighbour(i, 1));
    if (i > 0 && inPhrase && MINOR_WORDS.has(word.toLowerCase())) return word.toLowerCase();
    if (initialism(word)) return word;
    if (word.length > 3) return settle(word);
    if (!inPhrase || KEEP_CAPS.has(word)) return word;
    return settle(word);
  });
  return settled.join(" ");
}

// The brand for a label beside the product name: spelled as the displayed name spells it when
// the name contains it ("BIC" in "BIC Flex 5 Razors", "Digiorno" for "DIGIORNO"), so the two
// never disagree; otherwise the brand with its marks dropped.
export function brandName(brand: string, name: string): string {
  const clean = cleanName(brand);
  const body = escapeRegExp(clean).replace(/['’]/g, "['’]");
  if (!body) return clean;
  const match = new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, "iu").exec(displayName(name));
  return match ? match[0] : clean;
}

// Names longer than this are called by their brand in running prose when that is unambiguous.
export const PROSE_NAME_MAX = 32;

// The name to use in running prose. A long name that contains its brand as whole words is
// called by the brand, spelled as it appears in the name, when the brand has at least two words
// and no name in `others` contains it too; otherwise the full display name. "General Mills
// REESE'S PUFFS Chocolatey Peanut Butter Cereal" with brand "Reese's Puffs" becomes "Reese's
// Puffs". A one-word brand ("Dove", "Finish", "Glad") keeps the full name, since the word alone
// can read as an ordinary word or say too little.
export function proseName(
  name: string,
  brand: string | null | undefined,
  others: readonly string[] = [],
  max = PROSE_NAME_MAX,
): string {
  const full = displayName(name);
  const cleanBrand = brand ? cleanName(brand) : "";
  if (full.length <= max || cleanBrand.split(" ").filter(Boolean).length < 2) return full;
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
