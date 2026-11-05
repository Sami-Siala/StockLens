import { describe, expect, it, vi } from "vitest";
import { MemoryStore } from "@/lib/providers/cache/memory";
import { ResilientStore } from "@/lib/providers/cache/resilient";
import type { KeyValueStore } from "@/lib/providers/cache/types";
import { cachedFetch, type CacheDeps } from "@/lib/providers/cached";
import { ProviderError } from "@/lib/providers/errors";
import { checkRateLimit } from "@/lib/providers/ratelimit";
import { TTL } from "@/lib/providers/service";

vi.mock("server-only", () => ({}));

function setup(store?: KeyValueStore) {
  const clock = { t: 1_000_000 };
  const s = store ?? new MemoryStore(() => clock.t);
  const deps: CacheDeps = {
    store: s,
    now: () => clock.t,
    sleep: async () => {
      clock.t += 5;
      await new Promise((r) => setTimeout(r, 1));
    },
    inflight: new Map(),
    waitMs: 500,
    pollMs: 5,
  };
  return { clock, store: s, deps };
}
const policy = { softTtl: 10, staleTtl: 100 };

describe("MemoryStore TTL semantics", () => {
  it("expires keys, JSON round-trips values, and NX only creates once", async () => {
    const clock = { t: 0 };
    const s = new MemoryStore(() => clock.t);
    await s.set("k", { a: [1, 2], d: undefined }, 5);
    expect(await s.get("k")).toEqual({ a: [1, 2] });
    clock.t = 4_999;
    expect(await s.get("k")).not.toBeNull();
    clock.t = 5_000;
    expect(await s.get("k")).toBeNull();
    expect(await s.setIfAbsent("lock", "a", 10)).toBe(true);
    expect(await s.setIfAbsent("lock", "b", 10)).toBe(false);
    clock.t = 20_000;
    expect(await s.setIfAbsent("lock", "b", 10)).toBe(true);
  });
  it("increment is a fixed window from the first hit", async () => {
    const clock = { t: 0 };
    const s = new MemoryStore(() => clock.t);
    expect(await s.increment("c", 60)).toBe(1);
    clock.t = 30_000;
    expect(await s.increment("c", 60)).toBe(2);
    clock.t = 60_001;
    expect(await s.increment("c", 60)).toBe(1);
  });
});

describe("cachedFetch", () => {
  it("serves fresh data from cache without calling upstream", async () => {
    const { deps, clock } = setup();
    const f = vi.fn(async () => "v1");
    expect((await cachedFetch(deps, "k", policy, f)).data).toBe("v1");
    clock.t += 9_000;
    const r = await cachedFetch(deps, "k", policy, f);
    expect(r).toMatchObject({ data: "v1", stale: false });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("refetches after the soft TTL", async () => {
    const { deps, clock } = setup();
    let n = 0;
    const f = async () => `v${++n}`;
    await cachedFetch(deps, "k", policy, f);
    clock.t += 10_001;
    expect((await cachedFetch(deps, "k", policy, f)).data).toBe("v2");
  });

  it("serves the stale copy, flagged, when upstream fails after the soft TTL", async () => {
    const { deps, clock } = setup();
    await cachedFetch(deps, "k", policy, async () => "good");
    clock.t += 50_000; // soft expired, stale copy (100 s) still alive
    const r = await cachedFetch(deps, "k", policy, async () => {
      throw new ProviderError("upstream", "429");
    });
    expect(r).toMatchObject({ data: "good", stale: true });
  });

  it("does not serve a copy older than the stale TTL: typed error instead", async () => {
    const { deps, clock } = setup();
    await cachedFetch(deps, "k", policy, async () => "good");
    clock.t += 101_000;
    await expect(
      cachedFetch(deps, "k", policy, async () => {
        throw new ProviderError("upstream", "down");
      }),
    ).rejects.toMatchObject({ kind: "upstream" });
  });

  it("cools down after a failure: no hammering Yahoo for 10 s", async () => {
    const { deps, clock } = setup();
    const f = vi.fn(async () => {
      throw new ProviderError("upstream", "429");
    });
    await expect(cachedFetch(deps, "k", policy, f)).rejects.toBeInstanceOf(
      ProviderError,
    );
    await expect(cachedFetch(deps, "k", policy, f)).rejects.toBeInstanceOf(
      ProviderError,
    );
    expect(f).toHaveBeenCalledTimes(1);
    clock.t += 10_001;
    await expect(cachedFetch(deps, "k", policy, f)).rejects.toBeInstanceOf(
      ProviderError,
    );
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("remembers unknown tickers (negative cache) without calling upstream again", async () => {
    const { deps } = setup();
    const f = vi.fn(async () => {
      throw new ProviderError("not_found", "nope");
    });
    await expect(cachedFetch(deps, "k", policy, f)).rejects.toMatchObject({
      kind: "not_found",
    });
    await expect(cachedFetch(deps, "k", policy, f)).rejects.toMatchObject({
      kind: "not_found",
    });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("releases its lock, so the next refresh is not blocked", async () => {
    const { deps, clock, store } = setup();
    await cachedFetch(deps, "k", policy, async () => 1);
    expect(await store.get("l:k")).toBeNull();
    clock.t += 11_000;
    await cachedFetch(deps, "k", policy, async () => 2);
    expect(await store.get("l:k")).toBeNull();
  });

  it("survives a dead store: reads as miss, still fetches upstream", async () => {
    const dead: KeyValueStore = {
      kind: "upstash",
      get: async () => {
        throw new Error("ECONNREFUSED");
      },
      set: async () => {
        throw new Error("ECONNREFUSED");
      },
      setIfAbsent: async () => {
        throw new Error("ECONNREFUSED");
      },
      delete: async () => {
        throw new Error("ECONNREFUSED");
      },
      increment: async () => {
        throw new Error("ECONNREFUSED");
      },
    };
    const store = new ResilientStore(dead);
    const { deps } = setup(store);
    const r = await cachedFetch(deps, "k", policy, async () => "live");
    expect(r).toMatchObject({ data: "live", stale: false });
    expect(store.health.consecutiveFailures).toBeGreaterThan(0);
    // and the rate limiter fails open
    expect((await checkRateLimit(store, "ip")).allowed).toBe(true);
  });
});

describe("TTL table (PLAN §7)", () => {
  it("quote 30-60 s, fundamentals 12-24 h, every range has a policy, stale >= soft", () => {
    expect(TTL.core.softTtl).toBeGreaterThanOrEqual(30);
    expect(TTL.core.softTtl).toBeLessThanOrEqual(60);
    expect(TTL.detail.softTtl).toBeGreaterThanOrEqual(12 * 3600);
    expect(TTL.detail.softTtl).toBeLessThanOrEqual(24 * 3600);
    expect(Object.keys(TTL.chart).sort()).toEqual(
      ["1D", "1H", "1M", "1W", "1Y", "3Y", "5Y", "ALL"].sort(),
    );
    for (const p of [
      TTL.core,
      TTL.detail,
      TTL.search,
      ...Object.values(TTL.chart),
    ])
      expect(p.staleTtl).toBeGreaterThan(p.softTtl);
    // intraday refreshes faster than multi-year
    expect(TTL.chart["1H"].softTtl).toBeLessThan(TTL.chart["1Y"].softTtl);
    expect(TTL.chart["1Y"].softTtl).toBeLessThan(TTL.chart.ALL.softTtl);
  });
});

describe("rate limit", () => {
  it("allows up to the ceiling per IP per minute, then blocks with Retry-After", async () => {
    const clock = { t: 600_000 };
    const store = new MemoryStore(() => clock.t);
    const opts = { limit: 3, now: clock.t };
    for (let i = 0; i < 3; i++)
      expect((await checkRateLimit(store, "1.2.3.4", opts)).allowed).toBe(true);
    const blocked = await checkRateLimit(store, "1.2.3.4", opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(blocked.retryAfter).toBeLessThanOrEqual(60);
    // another IP (or the next minute) is unaffected
    expect((await checkRateLimit(store, "5.6.7.8", opts)).allowed).toBe(true);
    clock.t += 60_000;
    expect(
      (await checkRateLimit(store, "1.2.3.4", { limit: 3, now: clock.t }))
        .allowed,
    ).toBe(true);
  });
  it("default ceiling is high (a school can share one IP)", async () => {
    const store = new MemoryStore();
    const r = await checkRateLimit(store, "school");
    expect(r.limit).toBeGreaterThanOrEqual(300);
  });
});
