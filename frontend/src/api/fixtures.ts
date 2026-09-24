// Real API responses captured on 2026-09-23, used by tests and by the dev server when
// VITE_USE_FIXTURES=1. The JSON files are verbatim; the variants below cover states the
// captured data does not have (day one, no size changes, a failed run).
import type {
  AskResponse,
  CategoryCount,
  ChangeList,
  ChangeOut,
  FieldOut,
  FieldProduct,
  ProductDetail,
  SnapshotOut,
  Stats,
} from "./types";
import askJson from "./fixtures/ask.json";
import categoriesJson from "./fixtures/categories.json";
import changesJson from "./fixtures/changes.json";
import fieldJson from "./fixtures/field.json";
import statsJson from "./fixtures/stats.json";
import reeses from "./fixtures/products/0001600012222.json";
import philadelphia from "./fixtures/products/0002100004024.json";
import huggies from "./fixtures/products/0003600048756.json";
import kodiak from "./fixtures/products/0070559901480.json";
import lateJuly from "./fixtures/products/0081509902257.json";
import khloud from "./fixtures/products/0086001233561.json";

export const stats = statsJson as Stats;
export const categories = categoriesJson as CategoryCount[];
export const changeList = changesJson as unknown as ChangeList;
export const changes: ChangeOut[] = changeList.items;
export const field = fieldJson as FieldOut;
export const askResponse = askJson as AskResponse;

export const details: Record<string, ProductDetail> = Object.fromEntries(
  [reeses, philadelphia, huggies, kodiak, lateJuly, khloud].map((detail) => [
    detail.product.id,
    detail as unknown as ProductDetail,
  ]),
);

export const ids = {
  reeses: "0001600012222",
  philadelphia: "0002100004024",
  huggies: "0003600048756",
  kodiak: "0070559901480",
  lateJuly: "0081509902257",
  khloud: "0086001233561",
  dove: "0007940071601",
};

export const emptyChangeList: ChangeList = { items: [], total: 0, limit: 100, offset: 0 };

// Day-one shape: products tracked, nothing published yet, only the basket build has run.
export const dayOneStats: Stats = {
  ...stats,
  snapshots: stats.products_tracked,
  changes_published: 0,
  shrink_count: 0,
  grow_count: 0,
  price_increase_count: 0,
  price_decrease_count: 0,
  llm_calls: 402,
  llm_cost_usd: "0.074100",
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

// The same period with the size changes removed, so copy for a price-only story can be checked.
export const priceOnlyChanges: ChangeOut[] = changes.filter(
  (change) => change.kind === "price_increase" || change.kind === "price_decrease",
);
export const priceOnlyStats: Stats = {
  ...stats,
  changes_published: priceOnlyChanges.length,
  shrink_count: 0,
  grow_count: 0,
};

// A run that ended with errors.
export const failedRunStats: Stats = {
  ...stats,
  last_run: {
    ...stats.last_run!,
    id: 19,
    status: "partial",
    started_at: "2026-09-24T11:00:20.120217Z",
    finished_at: "2026-09-24T11:02:00.964933Z",
    products_checked: 480,
    snapshots_added: 0,
    changes_found: 0,
    api_calls: 10,
    errors: 15,
  },
};

const fieldById = new Map<string, FieldProduct>(field.products.map((product) => [product.id, product]));
const changeByProduct = new Map<string, ChangeOut>();
for (const change of [...changes].reverse()) changeByProduct.set(change.product.id, change);

// A product detail for any tracked id: the captured history when there is one, otherwise the
// change record's two states, otherwise one state built from the field entry.
export function detailFor(id: string): ProductDetail | null {
  const known = details[id];
  if (known) return known;
  const product = fieldById.get(id);
  if (!product) return null;
  const summary = {
    id: product.id,
    description: product.name,
    brand: product.brand ?? null,
    category: product.category,
    image_url: `https://www.kroger.com/product/images/medium/front/${product.id}`,
  };
  const change = changeByProduct.get(id);
  const snapshots: SnapshotOut[] =
    change?.before && change.after
      ? [change.before, change.after]
      : [
          {
            id: Number(id.slice(-6)),
            size_text: product.size ?? "",
            display_quantity: null,
            display_unit: null,
            quantity: null,
            base_unit: null,
            price_regular: product.price ?? null,
            price_promo: null,
            unit_price: null,
            first_seen_at: stats.tracking_since ?? "2026-09-07T22:54:30.883952Z",
            last_seen_at: stats.last_run?.finished_at ?? "2026-09-23T11:07:00.964933Z",
            observations: 17,
            parse_method: null,
            parse_confidence: null,
          },
        ];
  return {
    product: summary,
    upc: product.id,
    retailer_categories: [],
    active: true,
    first_seen_at: snapshots[0]!.first_seen_at,
    last_seen_at: snapshots[snapshots.length - 1]!.last_seen_at,
    current: snapshots[snapshots.length - 1]!,
    snapshots,
    changes: change ? [change] : [],
  };
}
