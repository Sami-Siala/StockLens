"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChartRange,
  ChartResponse,
  MarketResponse,
  QuotesResponse,
  SearchHit,
  StockSnapshot,
} from "@/lib/contract";
import {
  getChart,
  getMarket,
  getQuotes,
  getStock,
  searchSymbols,
} from "./index";
import { REFRESH_MS, shouldRefresh } from "./dashboard";
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

/** A resource that refreshes politely in the background and never flashes back to "loading". */
export type PolledResource<T> =
  | { status: "loading" }
  | { status: "ready"; data: T; refreshedAt: number }
  | { status: "error"; error: DataError };

type PolledState<T> =
  | { data: T; at: number; error?: undefined }
  | { error: DataError; data?: undefined; at: number };

/**
 * Stale-while-revalidate fetch for dashboard tiles.
 *  - Waits until `enabled` (so local lists are read before the one batched call).
 *  - Refreshes at most every 60 s, only while the tab is visible, and never when the user asks
 *    for reduced motion (content that changes by itself is a motion preference too).
 *  - A failed refresh keeps the data already on screen; only a first load can end in "error".
 */
function usePolledResource<T>(
  key: string | null,
  enabled: boolean,
  fetcher: (signal: AbortSignal) => Promise<T>,
): [PolledResource<T>, () => void, () => void] {
  const [state, setState] = useState<PolledState<T> | null>(null);
  const [nonce, setNonce] = useState(0);
  const lastFetch = useRef(0);

  useEffect(() => {
    if (key === null || !enabled) return;
    const controller = new AbortController();
    lastFetch.current = Date.now();
    fetcher(controller.signal).then(
      (data) => setState({ data, at: Date.now() }),
      (error: unknown) => {
        if (isAbort(error) || controller.signal.aborted) return;
        const e =
          error instanceof DataError ? error : new DataError("internal");
        setState((prev) => (prev?.data ? prev : { error: e, at: Date.now() }));
      },
    );
    return () => controller.abort();
  }, [key, enabled, nonce, fetcher]);

  useEffect(() => {
    if (key === null || !enabled) return;
    const reduced = () => {
      try {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      } catch {
        return false;
      }
    };
    const tick = () => {
      if (
        shouldRefresh({
          hidden: document.visibilityState !== "visible",
          reducedMotion: reduced(),
          lastFetchAt: lastFetch.current,
          now: Date.now(),
        })
      )
        setNonce((n) => n + 1);
    };
    const id = setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [key, enabled]);

  /** Retry after an error: back to the skeleton, then fetch again. */
  const retry = useCallback(() => {
    setState(null);
    setNonce((n) => n + 1);
  }, []);
  /** Manual refresh (the only refresh under reduced motion): keeps the data on screen. */
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const resource: PolledResource<T> = !state
    ? { status: "loading" }
    : state.error
      ? { status: "error", error: state.error }
      : { status: "ready", data: state.data as T, refreshedAt: state.at };
  return [resource, retry, refresh];
}

/** Batched quotes for the watchlist, starters and recents (one call for all tiles). */
export function useQuotes(symbols: string[], enabled = true) {
  const key = symbols.length ? symbols.join(",") : null;
  const fetcher = useCallback(
    (signal: AbortSignal) => getQuotes(symbols, signal),
    // `key` stands for the symbols' content, so a new array with the same symbols is not a new call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  return usePolledResource<QuotesResponse>(key, enabled, fetcher);
}

/** Markets-now tile: status chips and the index strip. */
export function useMarket(enabled = true) {
  const fetcher = useCallback((signal: AbortSignal) => getMarket(signal), []);
  return usePolledResource<MarketResponse>("market", enabled, fetcher);
}
