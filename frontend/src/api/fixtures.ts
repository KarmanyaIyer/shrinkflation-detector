// Realistic sample data shaped like the API responses. Used by tests and by the dev server when
// VITE_USE_FIXTURES=1, so the populated site can be checked without changing the database.
import type {
  AskResponse,
  BudgetOut,
  CategoryCount,
  ChangeList,
  ChangeOut,
  ProductDetail,
  ProductSummary,
  SnapshotOut,
  Stats,
} from "./types";

const IMG = "https://www.kroger.com/product/images/medium/front/";

function product(
  id: string,
  description: string,
  brand: string | null,
  category: string,
  withImage = true,
): ProductSummary {
  return { id, description, brand, category, image_url: withImage ? `${IMG}${id}` : null };
}

interface Parse {
  display_quantity: string;
  display_unit: string;
  quantity: string;
  base_unit: string;
  unit: string;
}

interface SnapshotSpec {
  id: number;
  size_text: string;
  price: string;
  first: string;
  last: string;
  observations: number;
  parse: Parse | null;
  unit_value?: string;
  method?: "rule" | "llm";
  confidence?: number;
  promo?: string;
}

function snapshot(spec: SnapshotSpec): SnapshotOut {
  const parse = spec.parse;
  return {
    id: spec.id,
    size_text: spec.size_text,
    display_quantity: parse?.display_quantity ?? null,
    display_unit: parse?.display_unit ?? null,
    quantity: parse?.quantity ?? null,
    base_unit: parse?.base_unit ?? null,
    price_regular: spec.price,
    price_promo: spec.promo ?? null,
    unit_price: parse && spec.unit_value ? { value: spec.unit_value, unit: parse.unit } : null,
    first_seen_at: spec.first,
    last_seen_at: spec.last,
    observations: spec.observations,
    parse_method: spec.method ?? (parse ? "rule" : "llm"),
    parse_confidence: spec.confidence ?? (parse ? 1.0 : 0.4),
  };
}

const oz = (display: string, grams: string): Parse => ({
  display_quantity: display,
  display_unit: "oz",
  quantity: grams,
  base_unit: "g",
  unit: "oz",
});
const flOz = (display: string, ml: string): Parse => ({
  display_quantity: display,
  display_unit: "fl oz",
  quantity: ml,
  base_unit: "ml",
  unit: "fl oz",
});
const count = (display: string): Parse => ({
  display_quantity: display,
  display_unit: "each",
  quantity: display,
  base_unit: "count",
  unit: "each",
});

const T = "T06:02:11Z";
const day = (d: string) => `${d}${T}`;

export const TRACKING_SINCE = "2026-07-06T22:54:30.883952Z";
const LAST = day("2026-09-07");

export const products = {
  cheerios: product("0001600012479", "General Mills Honey Nut Cheerios™ Cereal", "Cheerios", "Cereal and breakfast"),
  lays: product("0002840031041", "Lay's Classic Potato Chips", "Lay's", "Snacks"),
  tide: product("0003077212101", "Tide Original Scent Liquid Laundry Detergent", "Tide", "Household"),
  doritos: product("0002840005538", "Doritos Nacho Cheese Flavored Tortilla Chips", "Doritos", "Snacks"),
  folgers: product("0002550030409", "Folgers Classic Roast Medium Roast Ground Coffee", "Folgers", "Coffee and tea"),
  eggs: product("0001111060903", "Kroger® Grade A Large Eggs", "Kroger", "Dairy and eggs"),
  bread: product("0001111087034", "Bakery Fresh Goodness French Bread", "Bakery Fresh Goodness", "Bakery", false),
  cheeriosGiant: product("0001600012495", "General Mills Honey Nut Cheerios™ Giant Size Cereal", "Cheerios", "Cereal and breakfast"),
  milk: product("0001111041700", "Kroger® 2% Reduced Fat Milk", "Kroger", "Dairy and eggs"),
  oreo: product("0004400003109", "Oreo Chocolate Sandwich Cookies", "Oreo", "Snacks"),
};

// Cheerios has three snapshots: a price increase, then a size decrease at the same price.
const cheeriosSnapshots: SnapshotOut[] = [
  snapshot({ id: 1, size_text: "12 oz", price: "3.99", first: TRACKING_SINCE, last: day("2026-07-27"), observations: 22, parse: oz("12.0000", "340.1943"), unit_value: "0.3325" }),
  snapshot({ id: 1244, size_text: "12 oz", price: "4.29", first: day("2026-07-28"), last: day("2026-08-13"), observations: 17, parse: oz("12.0000", "340.1943"), unit_value: "0.3575" }),
  snapshot({ id: 1290, size_text: "10.8 oz", price: "4.29", first: day("2026-08-14"), last: LAST, observations: 25, parse: oz("10.8000", "306.1748"), unit_value: "0.3972" }),
];

function change(
  id: number,
  kind: string,
  summary: ProductSummary,
  before: SnapshotOut,
  after: SnapshotOut,
  pct: { size: string | null; price: string | null; unit: string | null },
): ChangeOut {
  return {
    id,
    kind,
    source: "kroger",
    product: summary,
    before,
    after,
    size_change_pct: pct.size,
    price_change_pct: pct.price,
    unit_price_change_pct: pct.unit,
    before_seen_at: before.last_seen_at,
    after_seen_at: after.first_seen_at,
    detected_at: after.first_seen_at,
    note: null,
  };
}

const pairs = {
  eggs: [
    snapshot({ id: 612, size_text: "12 ct", price: "3.49", first: TRACKING_SINCE, last: day("2026-08-31"), observations: 57, parse: count("12.0000"), unit_value: "0.2908" }),
    snapshot({ id: 1311, size_text: "12 ct", price: "2.99", first: day("2026-09-01"), last: LAST, observations: 7, parse: count("12.0000"), unit_value: "0.2492" }),
  ],
  folgers: [
    snapshot({ id: 401, size_text: "25.9 oz", price: "12.49", first: TRACKING_SINCE, last: day("2026-08-27"), observations: 53, parse: oz("25.9000", "734.2526"), unit_value: "0.4822" }),
    snapshot({ id: 1305, size_text: "25.9 oz", price: "13.99", first: day("2026-08-28"), last: LAST, observations: 11, parse: oz("25.9000", "734.2526"), unit_value: "0.5402" }),
  ],
  // Out of stock for three days between the two states, so the dates are not adjacent.
  lays: [
    snapshot({ id: 988, size_text: "8 oz", price: "4.79", first: TRACKING_SINCE, last: day("2026-08-20"), observations: 46, parse: oz("8.0000", "226.7962"), unit_value: "0.5988" }),
    snapshot({ id: 1298, size_text: "7.75 oz", price: "4.79", first: day("2026-08-24"), last: LAST, observations: 15, parse: oz("7.7500", "219.7088"), unit_value: "0.6181" }),
  ],
  tide: [
    snapshot({ id: 730, size_text: "92 fl oz", price: "13.99", first: TRACKING_SINCE, last: day("2026-08-19"), observations: 45, parse: flOz("92.0000", "2720.7647"), unit_value: "0.1521" }),
    snapshot({ id: 1294, size_text: "84 fl oz", price: "11.99", first: day("2026-08-20"), last: LAST, observations: 19, parse: flOz("84.0000", "2484.1765"), unit_value: "0.1427" }),
  ],
  doritos: [
    snapshot({ id: 991, size_text: "9.25 oz", price: "5.49", first: TRACKING_SINCE, last: day("2026-08-09"), observations: 35, parse: oz("9.2500", "262.2331"), unit_value: "0.5935" }),
    snapshot({ id: 1271, size_text: "9.75 oz", price: "5.49", first: day("2026-08-10"), last: LAST, observations: 29, parse: oz("9.7500", "276.4078"), unit_value: "0.5631" }),
  ],
  // Size text the parser could not read, so only the price is compared.
  bread: [
    snapshot({ id: 77, size_text: "each", price: "2.99", first: TRACKING_SINCE, last: day("2026-08-04"), observations: 30, parse: null }),
    snapshot({ id: 1256, size_text: "each", price: "3.29", first: day("2026-08-05"), last: LAST, observations: 34, parse: null }),
  ],
} satisfies Record<string, [SnapshotOut, SnapshotOut]>;

export const changes: ChangeOut[] = [
  change(8, "price_decrease", products.eggs, pairs.eggs[0], pairs.eggs[1], { size: "0.00", price: "-14.33", unit: "-14.33" }),
  change(7, "price_increase", products.folgers, pairs.folgers[0], pairs.folgers[1], { size: "0.00", price: "12.01", unit: "12.01" }),
  change(6, "shrink", products.lays, pairs.lays[0], pairs.lays[1], { size: "-3.13", price: "0.00", unit: "3.23" }),
  change(5, "shrink_price_cut", products.tide, pairs.tide[0], pairs.tide[1], { size: "-8.70", price: "-14.30", unit: "-6.13" }),
  change(4, "shrink", products.cheerios, cheeriosSnapshots[1]!, cheeriosSnapshots[2]!, { size: "-10.00", price: "0.00", unit: "11.11" }),
  change(3, "grow", products.doritos, pairs.doritos[0], pairs.doritos[1], { size: "5.41", price: "0.00", unit: "-5.13" }),
  change(2, "price_increase", products.bread, pairs.bread[0], pairs.bread[1], { size: null, price: "10.03", unit: null }),
  change(1, "price_increase", products.cheerios, cheeriosSnapshots[0]!, cheeriosSnapshots[1]!, { size: "0.00", price: "7.52", unit: "7.52" }),
];

export const changeList: ChangeList = { items: changes, total: changes.length, limit: 30, offset: 0 };
export const emptyChangeList: ChangeList = { items: [], total: 0, limit: 30, offset: 0 };

export const stats: Stats = {
  products_tracked: 1242,
  categories: 13,
  snapshots: 1319,
  changes_published: 8,
  shrink_count: 2,
  grow_count: 1,
  price_increase_count: 3,
  llm_calls: 68,
  llm_cost_usd: "0.005625",
  tracking_since: TRACKING_SINCE,
  last_run: {
    id: 64,
    kind: "refresh",
    status: "ok",
    started_at: "2026-09-07T06:00:04Z",
    finished_at: "2026-09-07T06:03:12Z",
    products_checked: 1242,
    snapshots_added: 3,
    changes_found: 1,
    api_calls: 26,
    errors: 0,
  },
  location_label: "a Kroger Marketplace store in Newport, Kentucky (Cincinnati area)",
};

// Day-one shape: products tracked, nothing published yet, no refresh run so far.
export const dayOneStats: Stats = {
  ...stats,
  snapshots: 1242,
  changes_published: 0,
  shrink_count: 0,
  grow_count: 0,
  price_increase_count: 0,
  tracking_since: "2026-09-07T22:54:30.883952Z",
  last_run: {
    id: 1,
    kind: "build_basket",
    status: "ok",
    started_at: "2026-09-07T22:54:30.922162Z",
    finished_at: "2026-09-07T22:57:04.997799Z",
    products_checked: 1242,
    snapshots_added: 1242,
    changes_found: 0,
    api_calls: 104,
    errors: 0,
  },
};

export const categories: CategoryCount[] = [
  { category: "Baby and pet", products: 60, changes: 0 },
  { category: "Bakery", products: 60, changes: 1 },
  { category: "Beverages", products: 108, changes: 0 },
  { category: "Candy", products: 36, changes: 0 },
  { category: "Cereal and breakfast", products: 60, changes: 2 },
  { category: "Coffee and tea", products: 48, changes: 1 },
  { category: "Dairy and eggs", products: 119, changes: 1 },
  { category: "Frozen", products: 95, changes: 0 },
  { category: "Household", products: 116, changes: 1 },
  { category: "Meat and deli", products: 48, changes: 0 },
  { category: "Pantry", products: 276, changes: 0 },
  { category: "Personal care", products: 96, changes: 0 },
  { category: "Snacks", products: 120, changes: 2 },
];

export const cheeriosDetail: ProductDetail = {
  product: products.cheerios,
  upc: "0001600012479",
  retailer_categories: ["Breakfast"],
  active: true,
  first_seen_at: TRACKING_SINCE,
  last_seen_at: LAST,
  current: cheeriosSnapshots[2]!,
  snapshots: cheeriosSnapshots,
  changes: changes.filter((c) => c.product.id === products.cheerios.id),
};

// A product with a single state so far, as every product looks on day one.
export const singleSnapshotDetail: ProductDetail = {
  product: products.cheeriosGiant,
  upc: "0001600012495",
  retailer_categories: ["Breakfast"],
  active: true,
  first_seen_at: TRACKING_SINCE,
  last_seen_at: LAST,
  current: snapshot({ id: 2, size_text: "18.8 oz", price: "6.49", first: TRACKING_SINCE, last: LAST, observations: 64, parse: oz("18.8000", "532.9710"), unit_value: "0.3452" }),
  snapshots: [
    snapshot({ id: 2, size_text: "18.8 oz", price: "6.49", first: TRACKING_SINCE, last: LAST, observations: 64, parse: oz("18.8000", "532.9710"), unit_value: "0.3452" }),
  ],
  changes: [],
};

function detailFromPair(summary: ProductSummary, pair: [SnapshotOut, SnapshotOut]): ProductDetail {
  return {
    product: summary,
    upc: summary.id,
    retailer_categories: [],
    active: true,
    first_seen_at: pair[0].first_seen_at,
    last_seen_at: pair[1].last_seen_at,
    current: pair[1],
    snapshots: pair,
    changes: changes.filter((c) => c.product.id === summary.id),
  };
}

function detailSingle(summary: ProductSummary, spec: SnapshotSpec): ProductDetail {
  const only = snapshot(spec);
  return {
    product: summary,
    upc: summary.id,
    retailer_categories: [],
    active: true,
    first_seen_at: only.first_seen_at,
    last_seen_at: only.last_seen_at,
    current: only,
    snapshots: [only],
    changes: [],
  };
}

export const details: Record<string, ProductDetail> = {
  [products.cheerios.id]: cheeriosDetail,
  [products.cheeriosGiant.id]: singleSnapshotDetail,
  [products.eggs.id]: detailFromPair(products.eggs, pairs.eggs),
  [products.folgers.id]: detailFromPair(products.folgers, pairs.folgers),
  [products.lays.id]: detailFromPair(products.lays, pairs.lays),
  [products.tide.id]: detailFromPair(products.tide, pairs.tide),
  [products.doritos.id]: detailFromPair(products.doritos, pairs.doritos),
  [products.bread.id]: detailFromPair(products.bread, pairs.bread),
  [products.milk.id]: detailSingle(products.milk, {
    id: 615, size_text: "1/2 gal", price: "2.79", first: TRACKING_SINCE, last: LAST, observations: 64, parse: flOz("64.0000", "1892.7059"), unit_value: "0.0436", method: "llm", confidence: 0.85,
  }),
  [products.oreo.id]: detailSingle(products.oreo, {
    id: 1002, size_text: "14.3 oz", price: "4.99", first: TRACKING_SINCE, last: LAST, observations: 64, parse: oz("14.3000", "405.3982"), unit_value: "0.3490", promo: "3.99",
  }),
};

export const allProducts: ProductSummary[] = Object.values(products);

export const budget: BudgetOut = { questions_per_day: 10, questions_remaining: 8 };

export const askResponse: AskResponse = {
  answer:
    "Yes. General Mills Honey Nut Cheerios Cereal went from 12 oz to 10.8 oz at the same regular price of $4.29. The 12 oz package was last seen on Aug 13, 2026 and the 10.8 oz package has been seen since Aug 14, 2026. The unit price rose from $0.358/oz to $0.397/oz, an increase of 11.1%.",
  tool_calls: [
    { name: "search_products", arguments: { query: "Honey Nut Cheerios" }, ms: 84, ok: true },
    { name: "get_product_history", arguments: { product_id: "0001600012479" }, ms: 61, ok: true },
  ],
  model: "deepseek-v4-flash",
  total_tokens: 2431,
  latency_ms: 3120,
  questions_remaining: 7,
  trace_id: "5f1c0f8f9d0a4b3c8e2a7d6c1b0f9e8d",
};
