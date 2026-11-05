import "server-only";
import type { KeyValueStore } from "./types";

interface Item {
  value: string;
  expiresAt: number;
}

/**
 * In-process store with real TTL semantics and an injectable clock (tests advance time without
 * sleeping). Values are JSON round-tripped on purpose so they behave like Upstash (no shared
 * object references, no Dates, no undefined).
 */
export class MemoryStore implements KeyValueStore {
  readonly kind = "memory" as const;
  private items = new Map<string, Item>();

  constructor(private now: () => number = Date.now) {}

  private live(key: string): Item | undefined {
    const it = this.items.get(key);
    if (!it) return undefined;
    if (it.expiresAt <= this.now()) {
      this.items.delete(key);
      return undefined;
    }
    return it;
  }

  async get<T>(key: string): Promise<T | null> {
    const it = this.live(key);
    return it ? (JSON.parse(it.value) as T) : null;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    this.items.set(key, {
      value: JSON.stringify(value),
      expiresAt: this.now() + ttlSeconds * 1000,
    });
    this.sweep();
  }

  async setIfAbsent(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<boolean> {
    if (this.live(key)) return false;
    await this.set(key, value, ttlSeconds);
    return true;
  }

  async delete(key: string): Promise<void> {
    this.items.delete(key);
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const it = this.live(key);
    if (!it) {
      this.items.set(key, {
        value: "1",
        expiresAt: this.now() + ttlSeconds * 1000,
      });
      return 1;
    }
    const n = Number(it.value) + 1;
    it.value = String(n);
    return n;
  }

  /** Keep a long-lived dev server from growing without bound. */
  private sweep() {
    if (this.items.size < 2000) return;
    const t = this.now();
    for (const [k, v] of this.items) if (v.expiresAt <= t) this.items.delete(k);
  }

  get size() {
    return this.items.size;
  }
}
