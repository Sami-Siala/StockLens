import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** Minimal stand-in for @upstash/redis that records the commands it receives. */
const calls: Array<[string, ...unknown[]]> = [];
const data = new Map<string, unknown>();
vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(public cfg: { url: string; token: string }) {}
    async get(k: string) {
      calls.push(["get", k]);
      return data.get(k) ?? null;
    }
    async mget(...keys: string[]) {
      calls.push(["mget", ...keys]);
      return keys.map((k) => data.get(k) ?? null);
    }
    async set(k: string, v: unknown, o?: { ex?: number; nx?: boolean }) {
      calls.push(["set", k, v, o]);
      if (o?.nx && data.has(k)) return null;
      data.set(k, v);
      return "OK";
    }
    async incr(k: string) {
      calls.push(["incr", k]);
      const n = Number(data.get(k) ?? 0) + 1;
      data.set(k, n);
      return n;
    }
    async expire(k: string, s: number) {
      calls.push(["expire", k, s]);
      return 1;
    }
    async del(k: string) {
      calls.push(["del", k]);
      data.delete(k);
      return 1;
    }
  },
}));

const { UpstashStore } = await import("@/lib/providers/cache/upstash");
const { getStore, setStoreForTests } = await import("@/lib/providers/cache");

beforeEach(() => {
  calls.length = 0;
  data.clear();
  setStoreForTests(null);
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
});

describe("UpstashStore command mapping", () => {
  const store = () => new UpstashStore("https://x.upstash.io", "tok");

  it("namespaces keys and always sets an expiry", async () => {
    const s = store();
    await s.set("d:AAPL", { a: 1 }, 60);
    expect(calls[0]).toEqual(["set", "sl:v1:d:AAPL", { a: 1 }, { ex: 60 }]);
    expect(await s.get("d:AAPL")).toEqual({ a: 1 });
  });

  it("lock = SET NX EX; second taker gets false", async () => {
    const s = store();
    expect(await s.setIfAbsent("l:k", "tok", 30)).toBe(true);
    expect(calls[0]).toEqual(["set", "sl:v1:l:k", "tok", { nx: true, ex: 30 }]);
    expect(await s.setIfAbsent("l:k", "other", 30)).toBe(false);
  });

  it("rate-limit counter: INCR, and EXPIRE only on the first hit (fixed window)", async () => {
    const s = store();
    expect(await s.increment("rl:ip:1", 65)).toBe(1);
    expect(await s.increment("rl:ip:1", 65)).toBe(2);
    expect(calls.filter((c) => c[0] === "expire")).toEqual([
      ["expire", "sl:v1:rl:ip:1", 65],
    ]);
  });

  it("getMany = ONE namespaced MGET for any number of keys (command count stays flat)", async () => {
    const s = store();
    await s.set("d:A", { a: 1 }, 60);
    calls.length = 0;
    expect(await s.getMany(["d:A", "d:B", "d:C"])).toEqual([
      { a: 1 },
      null,
      null,
    ]);
    expect(calls).toEqual([["mget", "sl:v1:d:A", "sl:v1:d:B", "sl:v1:d:C"]]);
    calls.length = 0;
    expect(await s.getMany([])).toEqual([]);
    expect(calls).toEqual([]); // nothing sent for an empty list
  });

  it("delete removes the key", async () => {
    const s = store();
    await s.set("x", 1, 5);
    await s.delete("x");
    expect(await s.get("x")).toBeNull();
  });
});

describe("store selection", () => {
  it("falls back to in-memory when the Upstash env vars are absent", () => {
    expect(getStore().kind).toBe("memory");
  });
  it("uses Upstash when both vars are present", () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://x.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
    expect(getStore().kind).toBe("upstash");
  });
  it("uses Upstash with the names the Vercel Marketplace integration injects", () => {
    process.env.KV_REST_API_URL = "https://x.upstash.io";
    process.env.KV_REST_API_TOKEN = "tok";
    expect(getStore().kind).toBe("upstash");
  });
  it("one var alone is not enough (no half-configured store)", () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://x.upstash.io";
    expect(getStore().kind).toBe("memory");
  });
});
