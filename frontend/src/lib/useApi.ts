import { useCallback, useEffect, useRef, useState } from "react";
import { isAbortError } from "../api/http";

export type AsyncState<T> =
  | { status: "loading"; data?: undefined; error?: undefined }
  | { status: "ok"; data: T; error?: undefined }
  | { status: "error"; data?: undefined; error: Error };

export type ApiState<T> = AsyncState<T> & { reload: () => void };

// Load data for the current dependencies, cancelling the previous request when they change.
// With enabled false nothing is requested and the state stays "loading", for requests whose
// parameters depend on another response.
export function useApi<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  options: { enabled?: boolean } = {},
): ApiState<T> {
  const enabled = options.enabled ?? true;
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    setState({ status: "loading" });
    if (!enabled) return undefined;
    const controller = new AbortController();
    loadRef.current(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: "ok", data });
      },
      (error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        setState({ status: "error", error: error instanceof Error ? error : new Error(String(error)) });
      },
    );
    return () => controller.abort();
    // The caller lists the values the loader closes over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { ...state, reload };
}

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

// True once a loading state has lasted longer than delayMs, so slow first loads can say so.
export function useSlow(loading: boolean, delayMs: number): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return undefined;
    }
    const handle = window.setTimeout(() => setSlow(true), delayMs);
    return () => window.clearTimeout(handle);
  }, [loading, delayMs]);
  return slow;
}

export function usePageTitle(title: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} · Shrinkflation Detector` : "Shrinkflation Detector";
    return () => {
      document.title = "Shrinkflation Detector";
    };
  }, [title]);
}
