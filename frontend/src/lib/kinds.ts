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

// What the change means for the shopper. A shrink that also got cheaper per unit counts as
// better, since the unit price fell.
export function kindTone(kind: string): "worse" | "better" | "" {
  if (kind === "shrink" || kind === "price_increase") return "worse";
  if (kind === "grow" || kind === "price_decrease" || kind === "shrink_price_cut") return "better";
  return "";
}

export const FILTER_LABELS: Record<FeedKind, string> = {
  shrink: "Shrank",
  grow: "Grew",
  price_increase: "Price up",
  price_decrease: "Price down",
  all: "All",
};

export const EMPTY_TITLES: Record<FeedKind, string> = {
  shrink: "Nothing has shrunk yet.",
  grow: "Nothing has grown yet.",
  price_increase: "No price increases yet.",
  price_decrease: "No price cuts yet.",
  all: "No changes yet.",
};

// Mirrors FEED_KINDS in the backend queries module. Used by the fixture server.
export const FEED_KIND_MEMBERS: Record<FeedKind, readonly string[]> = {
  shrink: ["shrink"],
  grow: ["grow"],
  price_increase: ["price_increase"],
  price_decrease: ["price_decrease"],
  all: ["shrink", "shrink_price_cut", "grow", "price_increase", "price_decrease"],
};
