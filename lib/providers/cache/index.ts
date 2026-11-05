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
 * The process-wide store. Upstash when UPSTASH_REDIS_REST_URL/TOKEN are set (Vercel injects
 * them), else an in-memory store so local dev and tests work with zero setup.
 * (In-memory on serverless = no sharing between instances; /api/health says so.)
 */
export function getStore(): ResilientStore {
  if (g.__stocklensStore) return g.__stocklensStore;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const inner: KeyValueStore =
    url && token ? new UpstashStore(url, token) : new MemoryStore();
  g.__stocklensStore = new ResilientStore(inner);
  return g.__stocklensStore;
}

/** Tests only. */
export function setStoreForTests(store: ResilientStore | null) {
  g.__stocklensStore = store;
}
