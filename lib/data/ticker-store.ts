/**
 * ONE shared ticker request for the whole app (the band sits on every page, and each page mounts
 * its own copy). A tiny external store keeps the response at module level, so
 *  - navigating to another page shows the data at once and does not refetch until it is ~60 s old,
 *  - two mounted bands (or React StrictMode's double mount) share the same in-flight request,
 *  - refreshes run only while the tab is visible, and a failed refresh keeps the data on screen.
 * The browser only ever calls our own /api/ticker (through the data-access layer).
 */
import type { TickerResponse } from "@/lib/contract";
import { DataError, isAbort } from "./errors";
import { shouldRefresh } from "./dashboard";
import { TICKER_REFRESH_MS } from "./ticker";

export type TickerState =
  | { status: "loading" }
  | { status: "ready"; data: TickerResponse; refreshedAt: number }
  | { status: "error"; error: DataError };

export interface TickerStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): TickerState;
  /** Fetch now unless a request is in flight or the data is fresh. Resolves when settled. */
  refreshIfStale(): Promise<void>;
}

export interface TickerStoreOptions {
  fetcher: (signal: AbortSignal) => Promise<TickerResponse>;
  now?: () => number;
  intervalMs?: number;
  /** Visibility source, injectable for tests. */
  isHidden?: () => boolean;
  /** Registers a listener that fires when the tab becomes visible; returns the cleanup. */
  onVisible?: (cb: () => void) => () => void;
}

const LOADING: TickerState = { status: "loading" };

export function createTickerStore(opts: TickerStoreOptions): TickerStore {
  const now = opts.now ?? Date.now;
  const intervalMs = opts.intervalMs ?? TICKER_REFRESH_MS;
  const isHidden =
    opts.isHidden ?? (() => typeof document !== "undefined" && document.hidden);
  const onVisible =
    opts.onVisible ??
    ((cb) => {
      if (typeof document === "undefined") return () => {};
      document.addEventListener("visibilitychange", cb);
      return () => document.removeEventListener("visibilitychange", cb);
    });

  let state: TickerState = LOADING;
  let lastFetchAt = 0;
  let inflight: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopVisible: (() => void) | null = null;

  const set = (next: TickerState) => {
    state = next;
    listeners.forEach((l) => l());
  };

  function load(): Promise<void> {
    lastFetchAt = now();
    const controller = new AbortController();
    inflight = opts
      .fetcher(controller.signal)
      .then(
        (data) => set({ status: "ready", data, refreshedAt: now() }),
        (error: unknown) => {
          if (isAbort(error)) return;
          // A failed refresh keeps what is already on screen; only a first load can end in "error".
          if (state.status === "ready") return;
          set({
            status: "error",
            error:
              error instanceof DataError ? error : new DataError("internal"),
          });
        },
      )
      .finally(() => {
        inflight = null;
      });
    return inflight;
  }

  function refreshIfStale(): Promise<void> {
    if (inflight) return inflight;
    // The very first request ignores tab visibility (nothing to show yet); later ones respect it.
    const first = lastFetchAt === 0;
    if (
      !first &&
      !shouldRefresh({
        hidden: isHidden(),
        reducedMotion: false, // numbers changing is not motion, and the band has no manual refresh
        lastFetchAt,
        now: now(),
        intervalMs,
      })
    )
      return Promise.resolve();
    return load();
  }

  function start() {
    timer = setInterval(() => void refreshIfStale(), intervalMs);
    stopVisible = onVisible(() => void refreshIfStale());
  }
  function stop() {
    if (timer) clearInterval(timer);
    stopVisible?.();
    timer = null;
    stopVisible = null;
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) start();
      void refreshIfStale();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
    getSnapshot: () => state,
    refreshIfStale,
  };
}
