import "server-only";
import type { CacheEntry, KeyValueStore } from "./cache/types";
import { ProviderError, safeMessage } from "./errors";

export interface CachePolicy {
  /** Fresh for this long (seconds). */
  softTtl: number;
  /** The copy is kept this long (seconds) and served, flagged stale, if upstream fails. */
  staleTtl: number;
}

export interface CachedResult<T> {
  data: T;
  /** True when upstream failed (or is cooling down) and this is the old copy. */
  stale: boolean;
  /** Epoch ms when the data was fetched upstream. */
  fetchedAt: number;
}

export interface CacheDeps {
  store: KeyValueStore;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Per-process in-flight map (cheap coalescing inside one instance). */
  inflight: Map<string, Promise<CachedResult<unknown>>>;
  /** How long a lock holder may take, and how long waiters poll for its result. */
  lockTtlSeconds?: number;
  waitMs?: number;
  pollMs?: number;
  /** Called after each real upstream attempt (feeds /api/health). */
  onUpstream?: (ok: boolean, error?: string) => void;
}

export const NOT_FOUND_TTL = 300; // an unknown ticker is remembered for 5 minutes
export const COOLDOWN_TTL = 10; // after an upstream failure, do not hammer Yahoo for 10 s

export interface FailMarker {
  at: number;
  message: string;
}

/**
 * Cache-aside with: soft TTL, a long-TTL stale copy, request coalescing (in-process map PLUS a
 * short Redis lock, so 15 students on 15 serverless instances cause ONE upstream fetch), a
 * negative cache for unknown tickers, and a short failure cooldown.
 */
export async function cachedFetch<T>(
  deps: CacheDeps,
  key: string,
  policy: CachePolicy,
  fetcher: () => Promise<T>,
): Promise<CachedResult<T>> {
  const { store, now } = deps;
  const entry = await store.get<CacheEntry<T>>(`d:${key}`);
  const fresh = (e: CacheEntry<T>) => now() - e.at < policy.softTtl * 1000;

  if (entry && fresh(entry)) return fromEntry(entry, false);

  // Share one refresh between concurrent callers in this process. The check-and-set below is
  // synchronous, so two callers can never both start a refresh.
  const running = deps.inflight.get(key);
  if (running) return running as Promise<CachedResult<T>>;
  const p = refresh(deps, key, policy, fetcher, entry).finally(() => {
    deps.inflight.delete(key);
  });
  deps.inflight.set(key, p);
  return p;
}

function fromEntry<T>(e: CacheEntry<T>, stale: boolean): CachedResult<T> {
  if (e.notFound)
    throw new ProviderError("not_found", "Unknown symbol (cached)");
  return { data: e.v, stale, fetchedAt: e.at };
}

async function refresh<T>(
  deps: CacheDeps,
  key: string,
  policy: CachePolicy,
  fetcher: () => Promise<T>,
  old: CacheEntry<T> | null,
): Promise<CachedResult<T>> {
  const { store, now } = deps;
  const serveStaleOrThrow = (err: unknown): CachedResult<T> => {
    if (old && !old.notFound) return fromEntry(old, true);
    throw err;
  };

  // Failure cooldown: someone just failed, do not retry yet.
  const fail = await store.get<FailMarker>(`f:${key}`);
  if (fail) {
    return serveStaleOrThrow(new ProviderError("upstream", fail.message));
  }

  const lockKey = `l:${key}`;
  const token = `t${now()}-${Math.random().toString(36).slice(2)}`; // never a bare number: Upstash JSON-parses reads
  const gotLock = await store.setIfAbsent(
    lockKey,
    token,
    deps.lockTtlSeconds ?? 30,
  );

  if (!gotLock) {
    // Another instance is fetching this key. Poll for its result instead of fetching too.
    const deadline = now() + (deps.waitMs ?? 10_000);
    while (now() < deadline) {
      await deps.sleep(deps.pollMs ?? 150);
      const e = await store.get<CacheEntry<T>>(`d:${key}`);
      if (e && (!old || e.at > old.at)) return fromEntry(e, false);
      const f = await store.get<FailMarker>(`f:${key}`);
      if (f) return serveStaleOrThrow(new ProviderError("upstream", f.message));
    }
    // The lock holder is gone or slow: use the old copy, else fetch ourselves.
    if (old && !old.notFound) return fromEntry(old, true);
  }

  try {
    const data = await fetcher();
    const entry: CacheEntry<T> = { v: data, at: now() };
    await store.set(`d:${key}`, entry, policy.staleTtl);
    deps.onUpstream?.(true);
    return { data, stale: false, fetchedAt: entry.at };
  } catch (e) {
    if (e instanceof ProviderError && e.kind === "not_found") {
      await store.set(
        `d:${key}`,
        { v: null, at: now(), notFound: true } satisfies CacheEntry<null>,
        NOT_FOUND_TTL,
      );
      // An unknown ticker is not a provider failure.
      deps.onUpstream?.(true);
      throw e;
    }
    deps.onUpstream?.(false, safeMessage(e));
    await store.set(
      `f:${key}`,
      { at: now(), message: safeMessage(e) } satisfies FailMarker,
      COOLDOWN_TTL,
    );
    return serveStaleOrThrow(
      e instanceof ProviderError
        ? e
        : new ProviderError("upstream", safeMessage(e)),
    );
  } finally {
    if (gotLock) {
      // Release only our own lock (it may have expired and been taken by someone else).
      const held = await store.get<string>(lockKey);
      if (held === token) await store.delete(lockKey);
    }
  }
}
