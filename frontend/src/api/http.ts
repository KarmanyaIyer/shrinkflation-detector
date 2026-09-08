// Minimal fetch wrapper. Paths are relative to the API base, for example "/changes?kind=shrink".
// With VITE_USE_FIXTURES=1 every request is answered from src/api/fixtures.ts instead.

export const API_BASE = (import.meta.env.VITE_API_BASE || "/api").replace(/\/+$/, "");
export const USE_FIXTURES = import.meta.env.VITE_USE_FIXTURES === "1";

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string | null;

  constructor(status: number, detail: string | null, message?: string) {
    super(message ?? detail ?? (status === 0 ? "Could not reach the API." : `Request failed with status ${status}.`));
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

// FastAPI puts messages in `detail`, either a string or a list of validation errors.
async function readDetail(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("detail" in body)) return null;
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => (item && typeof item === "object" && "msg" in item ? String(item.msg) : ""))
        .filter(Boolean);
      return messages.length ? messages.join(" ") : null;
    }
    return null;
  } catch {
    return null;
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (USE_FIXTURES) {
    const { fixtureRequest } = await import("./fixtureFetch");
    return fixtureRequest<T>(path, init);
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...(init.headers ?? {}) },
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError(0, null);
  }
  if (!response.ok) {
    throw new ApiError(response.status, await readDetail(response));
  }
  return (await response.json()) as T;
}
