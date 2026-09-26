import type { ChangeOut, FeedKind } from "../api/types";
import { unitChangePct } from "./changes";

// Labels for the kinds the backend publishes. Unknown kinds fall back to the raw value.
export const KIND_LABELS: Record<string, string> = {
  shrink: "Size down",
  shrink_price_cut: "Size down, cheaper per unit",
  grow: "Size up",
  price_increase: "Price up",
  price_decrease: "Price down",
};

// Where a label stands alone (the product drawer, the chart tooltip and announcement), size
// kinds say "listed size", since the detector reads the listing, not the package.
const LONG_LABELS: Record<string, string> = {
  shrink: "Listed size down",
  shrink_price_cut: "Listed size down, cheaper per unit",
  grow: "Listed size up",
};

export function kindLabel(kind: string, long = false): string {
  return (long ? LONG_LABELS[kind] : undefined) ?? KIND_LABELS[kind] ?? kind.replaceAll("_", " ");
}

export const SIZE_KINDS = new Set(["shrink", "shrink_price_cut", "grow"]);

// Which way the price per unit went, from the change itself when it carries the number and
// from the kind otherwise. "more" costs the shopper more.
export function direction(change: Pick<ChangeOut, "kind" | "unit_price_change_pct" | "price_change_pct">): "more" | "less" | "flat" {
  const unit = unitChangePct(change);
  if (unit !== null && unit !== 0) return unit > 0 ? "more" : "less";
  if (change.kind === "shrink" || change.kind === "price_increase") return "more";
  if (change.kind === "grow" || change.kind === "price_decrease" || change.kind === "shrink_price_cut") return "less";
  return "flat";
}

// The same for a bare kind, used where only the kind is known (the field endpoint).
export function kindDirection(kind: string | null | undefined): "more" | "less" | "flat" {
  if (kind === "shrink" || kind === "price_increase") return "more";
  if (kind === "grow" || kind === "price_decrease" || kind === "shrink_price_cut") return "less";
  return "flat";
}

export const FILTER_LABELS: Record<FeedKind, string> = {
  all: "All",
  shrink: "Size down",
  grow: "Size up",
  price_increase: "Price up",
  price_decrease: "Price down",
};

export const FILTER_ORDER: FeedKind[] = ["all", "shrink", "grow", "price_increase", "price_decrease"];

// Mirrors FEED_KINDS in the backend queries module. Used by the fixture server and the table.
export const FEED_KIND_MEMBERS: Record<FeedKind, readonly string[]> = {
  shrink: ["shrink"],
  grow: ["grow"],
  price_increase: ["price_increase"],
  price_decrease: ["price_decrease"],
  all: ["shrink", "shrink_price_cut", "grow", "price_increase", "price_decrease"],
};
