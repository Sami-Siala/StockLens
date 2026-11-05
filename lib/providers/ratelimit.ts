import "server-only";
import type { KeyValueStore } from "./cache/types";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets (for Retry-After). */
  retryAfter: number;
}

/** Per-IP ceiling. High on purpose: a school can share ONE IP (PLAN §7). Yahoo is protected by cache + coalescing. */
export const DEFAULT_LIMIT_PER_MINUTE = 300;

/** Fixed-window counter. Fails OPEN if the store is down (the cache layer still protects Yahoo). */
export async function checkRateLimit(
  store: KeyValueStore,
  id: string,
  opts: {
    limit?: number;
    windowSeconds?: number;
    now?: number;
    bucket?: string;
  } = {},
): Promise<RateLimitResult> {
  const limit = opts.limit ?? DEFAULT_LIMIT_PER_MINUTE;
  const windowSeconds = opts.windowSeconds ?? 60;
  const now = opts.now ?? Date.now();
  const windowIndex = Math.floor(now / (windowSeconds * 1000));
  const count = await store.increment(
    `rl:${opts.bucket ?? "api"}:${id}:${windowIndex}`,
    windowSeconds + 5,
  );
  const retryAfter = Math.max(
    1,
    Math.ceil(((windowIndex + 1) * windowSeconds * 1000 - now) / 1000),
  );
  if (count === 0)
    return { allowed: true, limit, remaining: limit, retryAfter }; // store down
  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfter,
  };
}
