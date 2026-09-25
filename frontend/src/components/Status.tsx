import type { CSSProperties } from "react";
import { ApiError } from "../api/http";

// A grey line the shape of the text it stands in for.
export function SkLine({ width, height = 14, style }: { width: number | string; height?: number; style?: CSSProperties }) {
  return <span className="sk-line" style={{ width, height, ...style }} aria-hidden="true" />;
}

export function describeLoadError(error: Error): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return "The API did not respond. Check your connection and try again.";
    if (error.status >= 500) return `The API returned an error (${error.status}). Try again in a minute.`;
    if (error.status === 404) return "The API has no record at that address.";
    return error.detail ?? error.message;
  }
  return error.message || "Something went wrong while loading.";
}
