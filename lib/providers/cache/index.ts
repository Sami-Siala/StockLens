import "server-only";
import { MemoryStore } from "./memory";
import { ResilientStore } from "./resilient";
import type { KeyValueStore } from "./types";
import { UpstashStore } from "./upstash";

export type { KeyValueStore, CacheEntry } from "./types";
export { MemoryStore } from "./memory";
export { ResilientStore } from "./resilient";

const g = globalThis as unknown as { __stocklensStore?: ResilientStore | null };

/**
 * The process-wide store. Upstash when its REST URL and token are set, else an in-memory store so
 * local dev and tests work with zero setup. The Vercel Marketplace integration injects them as
 * KV_REST_API_URL / KV_REST_API_TOKEN; UPSTASH_REDIS_REST_* (Upstash's own names) work too.
 * (In-memory on serverless = no sharing between instances; /api/health says so.)
 */
export function getStore(): ResilientStore {
  if (g.__stocklensStore) return g.__stocklensStore;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  const inner: KeyValueStore =
    url && token ? new UpstashStore(url, token) : new MemoryStore();
  g.__stocklensStore = new ResilientStore(inner);
  return g.__stocklensStore;
}

/** Tests only. */
export function setStoreForTests(store: ResilientStore | null) {
  g.__stocklensStore = store;
}
