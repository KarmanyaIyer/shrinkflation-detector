import type { ChangeOut } from "../api/types";
import { toNumber } from "./format";

// The change in price per unit when the change carries one, otherwise the shelf price change.
export function unitChangePct(change: Pick<ChangeOut, "unit_price_change_pct" | "price_change_pct">): number | null {
  return toNumber(change.unit_price_change_pct) ?? toNumber(change.price_change_pct);
}

function newer(a: ChangeOut, b: ChangeOut): boolean {
  const ta = Date.parse(a.detected_at);
  const tb = Date.parse(b.detected_at);
  return ta !== tb ? ta > tb : a.id > b.id;
}

// The newest published change of each product, ordered the way the API orders changes
// (detected_at, then id). A product that changed twice is drawn and counted by its latest change.
export function latestByProduct(changes: ChangeOut[]): Map<string, ChangeOut> {
  const map = new Map<string, ChangeOut>();
  for (const change of changes) {
    const current = map.get(change.product.id);
    if (!current || newer(change, current)) map.set(change.product.id, change);
  }
  return map;
}
