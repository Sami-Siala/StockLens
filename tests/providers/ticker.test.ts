import { describe, expect, it, vi } from "vitest";
import type { TickerItem } from "@/lib/contract";
import { MemoryStore } from "@/lib/providers/cache/memory";
import { ProviderError } from "@/lib/providers/errors";
import { normalizeCoreBatch } from "@/lib/providers/normalize/core";
import { tickerItem } from "@/lib/providers/normalize/ticker";
import {
  TICKER_SPECS,
  TICKER_SYMBOLS,
  asIndexKind,
} from "@/lib/providers/ticker-config";
import { FakeYahooClient, readDashboard } from "../helpers/fake-yahoo";
import { makeService } from "../helpers/setup";

vi.mock("server-only", () => ({}));

const AT = new Date("2026-11-05T21:30:00Z");
const tk = (opts: Parameters<typeof makeService>[0] = {}) =>
  makeService({ clock: { t: AT.getTime() }, ...opts });
const bySymbol = (items: TickerItem[], s: string) =>
  items.find((i) => i.symbol === s)!;

describe("ticker config", () => {
  it("has the 25 agreed symbols with unique ids, symbols and labels", () => {
    expect(TICKER_SPECS).toHaveLength(25);
    for (const key of ["id", "symbol", "label"] as const)
      expect(new Set(TICKER_SPECS.map((t) => t[key])).size).toBe(25);
    expect(TICKER_SYMBOLS).toContain("FTSEMIB.MI");
    expect(TICKER_SYMBOLS).toContain("000001.SS");
  });
  it("keeps each region contiguous, in the order americas, europe, asia_pacific, other", () => {
    const regions = TICKER_SPECS.map((t) => t.region);
    const collapsed = regions.filter((r, i) => r !== regions[i - 1]);
    expect(collapsed).toEqual(["americas", "europe", "asia_pacific", "other"]);
    expect(regions.filter((r) => r === "americas")).toHaveLength(7);
    expect(regions.filter((r) => r === "europe")).toHaveLength(8);
    expect(regions.filter((r) => r === "asia_pacific")).toHaveLength(6);
  });
  it("uses our own short labels and the strip's kinds for the macro trio", () => {
    const kind = (s: string) => TICKER_SPECS.find((t) => t.symbol === s)!.kind;
    expect(kind("^VIX")).toBe("volatility");
    expect(kind("EURUSD=X")).toBe("fx");
    expect(kind("GC=F")).toBe("future");
    expect(kind("^TNX")).toBe("yield");
    expect(asIndexKind("volatility")).toBe("index");
    for (const t of TICKER_SPECS) expect(t.label).toBe(t.label.trim());
  });
});

describe("tickerItem() normaliser", () => {
  it("maps a recorded row: our label, fraction %, no currency on points", async () => {
    const rows = await readDashboard<unknown[]>("ticker-quotes");
    const cores = normalizeCoreBatch(TICKER_SYMBOLS, rows, AT);
    const outcome = (s: string) => {
      const data = cores.get(s) as never;
      return {
        ok: true as const,
        value: { data, stale: false, fetchedAt: AT.getTime() },
      };
    };
    const spec = (s: string) => TICKER_SPECS.find((t) => t.symbol === s)!;

    const stoxx = tickerItem(spec("^STOXX50E"), outcome("^STOXX50E"), AT).item;
    expect(stoxx).toMatchObject({
      id: "eurostoxx50",
      label: "Euro Stoxx 50", // Yahoo says "EURO STOXX 50                 I"
      region: "europe",
      kind: "index",
      priceCurrency: null,
      status: "ok",
      stale: false,
    });
    expect(Math.abs(stoxx.changePercent!)).toBeLessThan(1);
    expect(stoxx.asOf).toMatch(/^2026-11-05T/);

    const gold = tickerItem(spec("GC=F"), outcome("GC=F"), AT).item;
    expect(gold.priceCurrency).toBe("USD");
    expect(tickerItem(spec("^VIX"), outcome("^VIX"), AT).item).toMatchObject({
      kind: "volatility",
      priceCurrency: null,
    });
    const us10y = tickerItem(spec("^TNX"), outcome("^TNX"), AT).item;
    expect(us10y.kind).toBe("yield");
    expect(us10y.price).toBeGreaterThan(1);
    expect(us10y.price).toBeLessThan(15); // a percent level, not a price
  });

  it("never throws: no outcome, a failed outcome or a row without price is `unavailable` with null numbers", () => {
    const spec = TICKER_SPECS[0];
    const empty = {
      price: null,
      change: null,
      changePercent: null,
      priceCurrency: null,
      marketState: "UNKNOWN",
      delayMinutes: null,
      asOf: null,
      status: "unavailable",
    };
    expect(tickerItem(spec, undefined, AT).item).toMatchObject(empty);
    expect(
      tickerItem(
        spec,
        { ok: false, error: new ProviderError("upstream", "429") },
        AT,
      ).item,
    ).toMatchObject({ ...empty, stale: false });
    const noPrice = normalizeCoreBatch(
      ["^GSPC"],
      [{ symbol: "^GSPC", currency: "USD" }],
      AT,
    ).get("^GSPC") as never;
    const r = tickerItem(
      spec,
      { ok: true, value: { data: noPrice, stale: true, fetchedAt: 1 } },
      AT,
    );
    expect(r.item).toMatchObject({ ...empty, stale: true });
    expect(JSON.stringify(r.item)).not.toMatch(/NaN|undefined/);
  });
});

describe("service.getTicker()", () => {
  it("returns every item in config order from ONE batched quote() and zero chart calls", async () => {
    const { service, client } = tk();
    const r = await service.getTicker();
    expect(r.meta).toMatchObject({
      contractVersion: "0.3.1",
      source: "yahoo",
      stale: false,
    });
    expect(r.items.map((i) => i.symbol)).toEqual(TICKER_SYMBOLS);
    expect(r.items.map((i) => i.id)).toEqual(TICKER_SPECS.map((t) => t.id));
    expect(r.items.every((i) => i.status === "ok" && !i.stale)).toBe(true);
    expect(client.calls).toMatchObject({ quotes: 1, chart: 0, quote: 0 });
    expect(client.batches[0].sort()).toEqual([...TICKER_SYMBOLS].sort());
    for (const i of r.items) {
      expect(Number.isFinite(i.price!), i.id).toBe(true);
      expect(Math.abs(i.changePercent!), i.id).toBeLessThan(1);
      if (i.kind !== "future") expect(i.priceCurrency, i.id).toBeNull();
    }
  });

  it("a second call within 60 s costs nothing; after 60 s it is one batch again (still no charts)", async () => {
    const { service, client, clock } = tk();
    await service.getTicker();
    clock.t += 59_000;
    await service.getTicker();
    expect(client.calls.quotes).toBe(1);
    clock.t += 2_000;
    await service.getTicker();
    expect(client.calls).toMatchObject({ quotes: 2, chart: 0 });
  });

  it("partial failure: symbols Yahoo omits are inline `unavailable`, the rest are fine, order unchanged", async () => {
    const { service } = tk({
      client: new FakeYahooClient({ omit: ["^BVSP", "^HSI"] }),
    });
    const r = await service.getTicker();
    expect(r.items.map((i) => i.symbol)).toEqual(TICKER_SYMBOLS);
    const down = r.items.filter((i) => i.status === "unavailable");
    expect(down.map((i) => i.symbol)).toEqual(["^BVSP", "^HSI"]);
    for (const i of down) {
      expect(i).toMatchObject({
        price: null,
        change: null,
        changePercent: null,
        asOf: null,
        marketState: "UNKNOWN",
        stale: false,
      });
    }
    expect(r.items.filter((i) => i.status === "ok")).toHaveLength(23);
    expect(r.meta.stale).toBe(false);
  });

  it("Yahoo down with nothing cached: still a response, every item `unavailable`", async () => {
    const { service } = tk({
      client: new FakeYahooClient({
        fail: { quotes: new ProviderError("upstream", "429") },
      }),
    });
    const r = await service.getTicker();
    expect(r.items).toHaveLength(25);
    expect(r.items.every((i) => i.status === "unavailable")).toBe(true);
    expect(r.items.map((i) => i.symbol)).toEqual(TICKER_SYMBOLS);
  });

  it("stale: Yahoo fails after the soft TTL -> every item keeps its last values with stale: true", async () => {
    const { service, client, clock } = tk();
    const fresh = await service.getTicker();
    clock.t += 5 * 60_000;
    client.opts.fail = { quotes: new ProviderError("upstream", "429") };
    const r = await service.getTicker();
    expect(r.meta.stale).toBe(true);
    expect(r.items.every((i) => i.status === "ok" && i.stale)).toBe(true);
    expect(r.items.map((i) => i.price)).toEqual(
      fresh.items.map((i) => i.price),
    );
    expect(r.meta.fetchedAt).toBe(fresh.meta.fetchedAt);
    expect(client.calls.chart).toBe(0);
    // Cooldown: the failure is remembered, so the next call does not hit Yahoo again.
    const calls = client.calls.quotes;
    await service.getTicker();
    expect(client.calls.quotes).toBe(calls);
  });

  it("stale for ONE symbol only: others stay fresh", async () => {
    const { service, client, clock } = tk();
    await service.getTicker();
    clock.t += 5 * 60_000;
    // Refresh everything except ^HSI (which Yahoo now omits -> not_found, no stale copy kept for it).
    client.opts.omit = ["^HSI"];
    const r = await service.getTicker();
    expect(bySymbol(r.items, "^HSI").status).toBe("unavailable");
    expect(bySymbol(r.items, "^GSPC")).toMatchObject({
      status: "ok",
      stale: false,
    });
  });

  it("shares `core:SYMBOL` with the dashboard: after the ticker, /api/quotes of an index needs no quote()", async () => {
    const { service, client } = tk();
    await service.getTicker();
    await service.getQuotes([{ symbol: "^GSPC", valid: true }]);
    expect(client.calls.quotes).toBe(1);
    expect(client.calls.chart).toBe(1); // only the sparkline of the watchlist call
  });
});

describe("cold start: 15 students load the ticker band at once", () => {
  it("15 parallel requests = ONE batched quote() and ZERO chart calls", async () => {
    const { service, client } = tk({
      client: new FakeYahooClient({ delayMs: 40 }),
    });
    const results = await Promise.all(
      Array.from({ length: 15 }, () => service.getTicker()),
    );
    expect(client.calls.quotes).toBe(1);
    expect(client.totalCalls).toBe(1);
    expect(client.chartSymbols).toEqual([]);
    expect(client.batches[0].sort()).toEqual([...TICKER_SYMBOLS].sort());
    for (const r of results) {
      expect(r.items).toHaveLength(25);
      expect(r.items.every((i) => i.status === "ok")).toBe(true);
    }
    const before = client.totalCalls;
    await Promise.all(Array.from({ length: 15 }, () => service.getTicker()));
    expect(client.totalCalls).toBe(before);
  });

  it("15 requests over 5 'serverless instances' sharing one store: every symbol fetched exactly once", async () => {
    const clock = { t: AT.getTime() };
    const store = new MemoryStore(() => clock.t); // stands in for Upstash
    const client = new FakeYahooClient({ delayMs: 40 });
    const instances = Array.from(
      { length: 5 },
      () => makeService({ client, store, clock }).service,
    );
    await Promise.all(
      Array.from({ length: 15 }, (_, i) => instances[i % 5].getTicker()),
    );
    expect(client.batches.flat().sort()).toEqual([...TICKER_SYMBOLS].sort());
    expect(client.calls.quotes).toBe(1);
    expect(client.calls.chart).toBe(0);
  });
});
