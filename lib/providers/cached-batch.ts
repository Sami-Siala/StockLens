import "server-only";
import type { CacheEntry } from "./cache/types";
import {
  COOLDOWN_TTL,
  NOT_FOUND_TTL,
  type CacheDeps,
  type CachePolicy,
  type CachedResult,
  type FailMarker,
} from "./cached";
import { ProviderError, safeMessage } from "./errors";

/**
 * The batch sibling of `cachedFetch`, for dashboards that need MANY symbols per request
 * (PLAN §4.3: "cheap on Yahoo"). Same cache layout (`d:`, `f:`, `l:` keys), so entries written
 * here are readable by `cachedFetch` and vice versa (the stock page and the watchlist share
 * `core:SYMBOL`).
 *
 *  - Reads every key with ONE `getMany` (one Redis command), not one GET per symbol.
 *  - Keys that are fresh come straight from cache.
 *  - Keys that need a refresh are fetched TOGETHER in one `fetchBatch(keys)` call.
 *  - Coalescing per KEY, not per list: 15 identical lists share one batch; overlapping lists
 *    fetch each symbol once (an in-process in-flight map, then a short Redis lock per key
 *    across serverless instances).
 *  - Failures are per key: a stale copy when we have one, else a typed error for that key only.
 */
export type BatchOutcome<T> =
  { ok: true; value: CachedResult<T> } | { ok: false; error: ProviderError };

type Slot<T> = CachedResult<T> | ProviderError;
interface Item<T> {
  key: string;
  old: CacheEntry<T> | null;
}

const toProviderError = (e: unknown): ProviderError =>
  e instanceof ProviderError
    ? e
    : new ProviderError("upstream", safeMessage(e));

function fromEntry<T>(e: CacheEntry<T>, stale: boolean): Slot<T> {
  return e.notFound
    ? new ProviderError("not_found", "Unknown symbol (cached)")
    : { data: e.v, stale, fetchedAt: e.at };
}

const outcome = <T>(s: Slot<T>): BatchOutcome<T> =>
  s instanceof ProviderError ? { ok: false, error: s } : { ok: true, value: s };

export async function cachedBatch<T>(
  deps: CacheDeps,
  keys: string[],
  policy: CachePolicy,
  /** Returns, per requested key, the value or the ProviderError for that key. A throw fails every key. */
  fetchBatch: (keys: string[]) => Promise<Map<string, T | ProviderError>>,
): Promise<Map<string, BatchOutcome<T>>> {
  const { store, now } = deps;
  const unique = [...new Set(keys)];
  const out = new Map<string, BatchOutcome<T>>();
  if (!unique.length) return out;

  const entries = await store.getMany<CacheEntry<T>>(
    unique.map((k) => `d:${k}`),
  );
  const todo: Item<T>[] = [];
  unique.forEach((key, i) => {
    const e = entries[i];
    if (e && now() - e.at < policy.softTtl * 1000)
      out.set(key, outcome(fromEntry(e, false)));
    else todo.push({ key, old: e });
  });

  // Everything below up to `inflight.set` is synchronous: two callers can never both claim a key.
  const pending: Promise<void>[] = [];
  const mine: Item<T>[] = [];
  const settle = (key: string, p: Promise<CachedResult<unknown>>) =>
    p.then(
      (r) => void out.set(key, outcome(r as CachedResult<T>)),
      (e) => void out.set(key, outcome(toProviderError(e))),
    );
  for (const it of todo) {
    const running = deps.inflight.get(it.key);
    if (running) pending.push(settle(it.key, running));
    else mine.push(it);
  }
  if (mine.length) {
    const batch = refreshBatch(deps, mine, policy, fetchBatch);
    for (const it of mine) {
      const p: Promise<CachedResult<unknown>> = batch
        .then((m) => {
          const r = m.get(it.key) ?? new ProviderError("upstream", "no result");
          if (r instanceof ProviderError) throw r;
          return r as CachedResult<unknown>;
        })
        .finally(() => {
          deps.inflight.delete(it.key);
        });
      deps.inflight.set(it.key, p);
      pending.push(settle(it.key, p));
    }
  }
  await Promise.all(pending);
  return out;
}

async function refreshBatch<T>(
  deps: CacheDeps,
  items: Item<T>[],
  policy: CachePolicy,
  fetchBatch: (keys: string[]) => Promise<Map<string, T | ProviderError>>,
): Promise<Map<string, Slot<T>>> {
  const { store, now } = deps;
  const res = new Map<string, Slot<T>>();
  const staleOrErr = (it: Item<T>, err: ProviderError): Slot<T> =>
    it.old && !it.old.notFound ? fromEntry(it.old, true) : err;

  // Failure cooldown: someone just failed on these keys, do not hammer Yahoo.
  const fails = await store.getMany<FailMarker>(items.map((i) => `f:${i.key}`));
  const go: Item<T>[] = [];
  items.forEach((it, i) => {
    const f = fails[i];
    if (f)
      res.set(it.key, staleOrErr(it, new ProviderError("upstream", f.message)));
    else go.push(it);
  });
  if (!go.length) return res;

  const fetchAndStore = async (list: Item<T>[]) => {
    let results: Map<string, T | ProviderError> | null = null;
    let callError: ProviderError | null = null;
    try {
      results = await fetchBatch(list.map((i) => i.key));
      deps.onUpstream?.(true);
    } catch (e) {
      callError = toProviderError(e);
      deps.onUpstream?.(false, safeMessage(e));
    }
    await Promise.all(
      list.map(async (it) => {
        const r = results
          ? (results.get(it.key) ??
            new ProviderError("not_found", "No result for symbol"))
          : callError!;
        if (!(r instanceof ProviderError)) {
          const entry: CacheEntry<T> = { v: r as T, at: now() };
          await store.set(`d:${it.key}`, entry, policy.staleTtl);
          res.set(it.key, { data: r as T, stale: false, fetchedAt: entry.at });
        } else if (r.kind === "not_found") {
          await store.set(
            `d:${it.key}`,
            { v: null, at: now(), notFound: true } satisfies CacheEntry<null>,
            NOT_FOUND_TTL,
          );
          res.set(it.key, r);
        } else {
          await store.set(
            `f:${it.key}`,
            { at: now(), message: r.message } satisfies FailMarker,
            COOLDOWN_TTL,
          );
          res.set(it.key, staleOrErr(it, r));
        }
      }),
    );
  };

  const token = `t${now()}-${Math.random().toString(36).slice(2)}`;
  const got = await Promise.all(
    go.map((it) =>
      store.setIfAbsent(`l:${it.key}`, token, deps.lockTtlSeconds ?? 30),
    ),
  );
  const locked = go.filter((_, i) => got[i]);
  const waiting = go.filter((_, i) => !got[i]);

  const waitFor = async (list: Item<T>[]) => {
    // Another instance is fetching these keys: poll for its result instead of fetching too.
    const deadline = now() + (deps.waitMs ?? 10_000);
    let remaining = list;
    while (remaining.length && now() < deadline) {
      await deps.sleep(deps.pollMs ?? 150);
      const [ents, fl] = await Promise.all([
        store.getMany<CacheEntry<T>>(remaining.map((i) => `d:${i.key}`)),
        store.getMany<FailMarker>(remaining.map((i) => `f:${i.key}`)),
      ]);
      const next: Item<T>[] = [];
      remaining.forEach((it, i) => {
        const e = ents[i];
        if (e && (!it.old || e.at > it.old.at))
          res.set(it.key, fromEntry(e, false));
        else if (fl[i])
          res.set(
            it.key,
            staleOrErr(it, new ProviderError("upstream", fl[i]!.message)),
          );
        else next.push(it);
      });
      remaining = next;
    }
    // The lock holder is gone or slow: old copy if any, else fetch ourselves.
    const orphans: Item<T>[] = [];
    for (const it of remaining) {
      if (it.old && !it.old.notFound) res.set(it.key, fromEntry(it.old, true));
      else orphans.push(it);
    }
    if (orphans.length) await fetchAndStore(orphans);
  };

  try {
    await Promise.all([
      locked.length ? fetchAndStore(locked) : undefined,
      waiting.length ? waitFor(waiting) : undefined,
    ]);
  } finally {
    // Release only our own locks (one may have expired and been taken by someone else).
    await Promise.all(
      locked.map(async (it) => {
        const held = await store.get<string>(`l:${it.key}`);
        if (held === token) await store.delete(`l:${it.key}`);
      }),
    );
  }
  return res;
}
