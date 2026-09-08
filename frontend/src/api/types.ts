// Named aliases over the generated OpenAPI types. Regenerate schema.d.ts with
// `pnpm generate-api-types` when the backend changes.
import type { components, paths } from "./schema";

type Schemas = components["schemas"];

export type Stats = Schemas["Stats"];
export type LastRun = Schemas["LastRun"];
export type CategoryCount = Schemas["CategoryCount"];
export type ChangeList = Schemas["ChangeList"];
export type ChangeOut = Schemas["ChangeOut"];
export type ProductSummary = Schemas["ProductSummary"];
export type ProductSearchResult = Schemas["ProductSearchResult"];
export type ProductDetail = Schemas["ProductDetail"];
export type SnapshotOut = Schemas["SnapshotOut"];
export type UnitPrice = Schemas["UnitPrice"];
export type AskRequest = Schemas["AskRequest"];
export type AskResponse = Schemas["AskResponse"];
export type ToolCallOut = Schemas["ToolCallOut"];
export type BudgetOut = Schemas["BudgetOut"];
export type Health = Schemas["Health"];

export type ChangesQuery = NonNullable<paths["/api/changes"]["get"]["parameters"]["query"]>;

export const FEED_KINDS = ["shrink", "grow", "price_increase", "price_decrease", "all"] as const;
export type FeedKind = (typeof FEED_KINDS)[number];

export function isFeedKind(value: string | null | undefined): value is FeedKind {
  return (FEED_KINDS as readonly string[]).includes(value ?? "");
}
