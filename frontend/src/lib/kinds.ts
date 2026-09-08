import type { FeedKind } from "../api/types";

// Labels for the kinds the backend publishes. Unknown kinds fall back to the raw value.
export const KIND_LABELS: Record<string, string> = {
  shrink: "Shrank",
  shrink_price_cut: "Shrank, cheaper per unit",
  grow: "Grew",
  price_increase: "Price up",
  price_decrease: "Price down",
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind.replaceAll("_", " ");
}

export const FILTER_LABELS: Record<FeedKind, string> = {
  shrink: "Shrank",
  grow: "Grew",
  price_increase: "Price up",
  price_decrease: "Price down",
  all: "All",
};

// Nouns for "No {noun} recorded yet."
export const EMPTY_NOUNS: Record<FeedKind, string> = {
  shrink: "size decreases",
  grow: "size increases",
  price_increase: "price increases",
  price_decrease: "price decreases",
  all: "changes",
};

// Mirrors FEED_KINDS in the backend queries module. Used by the fixture server.
export const FEED_KIND_MEMBERS: Record<FeedKind, readonly string[]> = {
  shrink: ["shrink"],
  grow: ["grow"],
  price_increase: ["price_increase"],
  price_decrease: ["price_decrease"],
  all: ["shrink", "shrink_price_cut", "grow", "price_increase", "price_decrease"],
};
