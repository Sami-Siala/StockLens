import "server-only";
import { Redis } from "@upstash/redis";
import type { KeyValueStore } from "./types";

/** Upstash Redis over REST (works from serverless: no sockets). Keys are namespaced. */
export class UpstashStore implements KeyValueStore {
  readonly kind = "upstash" as const;
  private redis: Redis;

  constructor(
    url: string,
    token: string,
    private prefix = "sl:v1:",
  ) {
    // Default retries are fine; the resilient wrapper turns remaining failures into "miss".
    this.redis = new Redis({ url, token });
  }

  async get<T>(key: string): Promise<T | null> {
    return (await this.redis.get<T>(this.prefix + key)) ?? null;
  }

  async getMany<T>(keys: string[]): Promise<Array<T | null>> {
    if (!keys.length) return [];
    const rows = await this.redis.mget<Array<T | null>>(
      ...keys.map((k) => this.prefix + k),
    );
    return rows.map((r) => r ?? null);
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.redis.set(this.prefix + key, value, { ex: ttlSeconds });
  }

  async setIfAbsent(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<boolean> {
    const r = await this.redis.set(this.prefix + key, value, {
      nx: true,
      ex: ttlSeconds,
    });
    return r === "OK";
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(this.prefix + key);
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const k = this.prefix + key;
    const n = await this.redis.incr(k);
    if (n === 1) await this.redis.expire(k, ttlSeconds); // fixed window from the first hit
    return n;
  }
}
