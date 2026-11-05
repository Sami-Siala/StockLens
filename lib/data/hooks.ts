"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ChartRange,
  ChartResponse,
  SearchHit,
  StockSnapshot,
} from "@/lib/contract";
import { getChart, getStock, searchSymbols } from "./index";
import { DataError, isAbort } from "./errors";

export type Resource<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; error: DataError };

type Settled<T> = { key: string; nonce: number } & (
  { data: T; error?: undefined } | { error: DataError; data?: undefined }
);

/**
 * Tiny fetch-state hook. The "loading" state is derived (the settled result belongs to
 * another key), so there is no synchronous setState inside the effect.
 */
function useResource<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
): [Resource<T>, () => void] {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    fetcher(controller.signal).then(
      (data) => setSettled({ key, nonce, data }),
      (error: unknown) => {
        if (isAbort(error) || controller.signal.aborted) return;
        setSettled({
          key,
          nonce,
          error: error instanceof DataError ? error : new DataError("internal"),
        });
      },
    );
    return () => controller.abort();
  }, [key, nonce, fetcher]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  if (!settled || settled.key !== key || settled.nonce !== nonce)
    return [{ status: "loading" }, retry];
  if (settled.error) return [{ status: "error", error: settled.error }, retry];
  return [{ status: "ready", data: settled.data as T }, retry];
}

export function useStock(symbol: string) {
  const fetcher = useCallback(
    (signal: AbortSignal) => getStock(symbol, signal),
    [symbol],
  );
  return useResource<StockSnapshot>(`stock:${symbol}`, fetcher);
}

export function useChart(symbol: string, range: ChartRange) {
  const fetcher = useCallback(
    (signal: AbortSignal) => getChart(symbol, range, signal),
    [symbol, range],
  );
  return useResource<ChartResponse>(`chart:${symbol}:${range}`, fetcher);
}

/** Search-as-you-type; `query` should already be debounced. Empty query = idle. */
export function useSearch(query: string) {
  const trimmed = query.trim();
  const fetcher = useCallback(
    (signal: AbortSignal) => searchSymbols(trimmed, signal).then((r) => r.hits),
    [trimmed],
  );
  return useResource<SearchHit[]>(
    trimmed ? `search:${trimmed}` : null,
    fetcher,
  );
}
