import "server-only";
import type { KeyValueStore } from "./types";

export interface StoreHealth {
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  consecutiveFailures: number;
}

/**
 * Wraps a remote store so that an outage degrades to "cache miss" instead of an error:
 * reads return null, writes are dropped, locks are reported as acquired (we then fetch
 * upstream without coalescing, which is slower but correct), rate-limit counters fail open.
 * Tracks health for /api/health.
 */
export class ResilientStore implements KeyValueStore {
  readonly health: StoreHealth = {
    lastSuccessAt: null,
    lastFailureAt: null,
    consecutiveFailures: 0,
  };

  constructor(
    private inner: KeyValueStore,
    private now: () => number = Date.now,
  ) {}

  get kind() {
    return this.inner.kind;
  }

  private async run<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      const r = await fn();
      this.health.lastSuccessAt = this.now();
      this.health.consecutiveFailures = 0;
      return r;
    } catch {
      this.health.lastFailureAt = this.now();
      this.health.consecutiveFailures++;
      return fallback;
    }
  }

  get<T>(key: string) {
    return this.run(() => this.inner.get<T>(key), null as T | null);
  }
  getMany<T>(keys: string[]) {
    return this.run(
      () => this.inner.getMany<T>(keys),
      keys.map(() => null) as Array<T | null>,
    );
  }
  set(key: string, value: unknown, ttl: number) {
    return this.run(() => this.inner.set(key, value, ttl), undefined);
  }
  setIfAbsent(key: string, value: unknown, ttl: number) {
    return this.run(() => this.inner.setIfAbsent(key, value, ttl), true);
  }
  delete(key: string) {
    return this.run(() => this.inner.delete(key), undefined);
  }
  increment(key: string, ttl: number) {
    return this.run(() => this.inner.increment(key, ttl), 0);
  }
}
