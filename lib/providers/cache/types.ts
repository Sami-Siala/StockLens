import "server-only";

/**
 * The tiny storage surface the data layer needs. Two implementations:
 *  - UpstashStore  (shared between serverless instances; production)
 *  - MemoryStore   (per process; local dev, tests, and the fallback when Upstash is not configured
 *                   or is down)
 * Values must be JSON-serialisable.
 */
export interface KeyValueStore {
  readonly kind: "memory" | "upstash";
  get<T>(key: string): Promise<T | null>;
  /**
   * Batch read (one round-trip, ONE Redis command: MGET). Same order as `keys`; null = miss.
   * Dashboards read ~25 symbols per request, so this keeps the command count (Upstash free tier
   * is metered per command) flat instead of linear in the list size.
   */
  getMany<T>(keys: string[]): Promise<Array<T | null>>;
  /** ttlSeconds is mandatory: nothing in this app lives forever. */
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  /** SET NX with expiry. True when we created the key (we own the lock). */
  setIfAbsent(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** Atomic increment; the key expires `ttlSeconds` after its FIRST increment (fixed window). */
  increment(key: string, ttlSeconds: number): Promise<number>;
}

/** What we store per cached resource. `at` is epoch ms of the upstream fetch. */
export interface CacheEntry<T> {
  v: T;
  at: number;
  /** Negative-cache marker: the upstream said "no such symbol". */
  notFound?: boolean;
}
