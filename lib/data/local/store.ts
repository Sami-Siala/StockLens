/**
 * Browser-local lists (watchlist, recently viewed, recent searches). PLAN §2: no accounts, no
 * tracking, everything stays in this browser.
 *
 * - Every storage access is wrapped in try/catch (private mode, blocked storage, quota): when
 *   storage is unavailable the list lives in memory for the session and the page still works.
 * - SSR-safe: nothing touches `window` at import or render time. The React hook reads through
 *   `useSyncExternalStore`, whose server snapshot is the empty list.
 * - Values read back from storage are validated, never trusted.
 */
import { useMemo, useSyncExternalStore } from "react";

/** The slice of the Storage API we use; tests pass a fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** `window.localStorage`, or `null` when it is missing or throws (blocked, private mode, SSR). */
export function browserStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export interface ListStore<T> {
  /** Raw snapshot (a string, so React can compare it cheaply). */
  snapshot(): string;
  parse(raw: string): T[];
  read(): T[];
  write(items: T[]): void;
  subscribe(listener: () => void): () => void;
}

export interface ListStoreOptions<T> {
  key: string;
  /** Returns a clean item or `null` to drop it. */
  validate(value: unknown): T | null;
  /** Items with the same id are the same entry. */
  id(item: T): string;
  max: number;
  storage?: () => StorageLike | null;
}

export function createListStore<T>(opts: ListStoreOptions<T>): ListStore<T> {
  const getStorage = opts.storage ?? browserStorage;
  const listeners = new Set<() => void>();
  let memory = "[]";
  // True after a write that storage refused (quota): the stored copy is then older than `memory`.
  let memoryOnly = false;

  function snapshot(): string {
    if (memoryOnly) return memory;
    try {
      const raw = getStorage()?.getItem(opts.key);
      if (typeof raw === "string") return raw;
    } catch {
      /* fall through to memory */
    }
    return memory;
  }

  function parse(raw: string): T[] {
    try {
      const data: unknown = JSON.parse(raw);
      if (!Array.isArray(data)) return [];
      const seen = new Set<string>();
      const out: T[] = [];
      for (const v of data) {
        const item = opts.validate(v);
        if (!item || seen.has(opts.id(item))) continue;
        seen.add(opts.id(item));
        out.push(item);
        if (out.length >= opts.max) break;
      }
      return out;
    } catch {
      return [];
    }
  }

  const emit = () => listeners.forEach((l) => l());

  return {
    snapshot,
    parse,
    read: () => parse(snapshot()),
    write(items) {
      const raw = JSON.stringify(items.slice(0, opts.max));
      memory = raw;
      try {
        getStorage()?.setItem(opts.key, raw);
        memoryOnly = false;
      } catch {
        /* quota or blocked: the memory copy is what we read from now on, for this session */
        memoryOnly = true;
      }
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      const onStorage = (e: StorageEvent) => {
        if (e.key === opts.key || e.key === null) listener();
      };
      try {
        window.addEventListener("storage", onStorage);
      } catch {
        /* no window */
      }
      return () => {
        listeners.delete(listener);
        try {
          window.removeEventListener("storage", onStorage);
        } catch {
          /* no window */
        }
      };
    },
  };
}

const EMPTY = "[]";

/** Reactive view of a store: `[]` on the server and during hydration, the real list after. */
export function useListStore<T>(store: ListStore<T>): T[] {
  const raw = useSyncExternalStore(
    store.subscribe,
    store.snapshot,
    () => EMPTY,
  );
  return useMemo(() => store.parse(raw), [store, raw]);
}

/** False on the server and during hydration, true afterwards (lets effects wait for local data). */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
