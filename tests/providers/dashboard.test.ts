import { describe, expect, it, vi } from "vitest";
import type { MarketResponse, QuotesResponse } from "@/lib/contract";
import { MemoryStore } from "@/lib/providers/cache/memory";
import { ProviderError } from "@/lib/providers/errors";
import { normalizeCoreBatch } from "@/lib/providers/normalize/core";
import {
  MARKET_STRIP,
  MARKETS,
  buildStatus,
  normalizeSparkline,
  scheduleState,
  thin,
} from "@/lib/providers/normalize/lite";
import { MAX_QUOTE_SYMBOLS, QuotesParamSchema } from "@/lib/providers/schemas";
import { FakeYahooClient, readDashboard } from "../helpers/fake-yahoo";
import { makeService } from "../helpers/setup";

vi.mock("server-only", () => ({}));

/** When the dashboard recordings were made (Thu 5 Nov 2026 ~21:20 UTC, after the US close). */
const DASH_AT = new Date("2026-11-05T21:30:00Z").getTime();
const dash = (opts: Parameters<typeof makeService>[0] = {}) =>
  makeService({ clock: { t: DASH_AT }, ...opts });

/** 12 tickers like a real watchlist + starters. */
const TWELVE = [
  "AAPL",
  "MC.PA",
  "7203.T",
  "SPY",
  "TSM",
  "SHEL.L",
  "JPM",
  "RIVN",
  "^GSPC",
  "^IXIC",
  "^FCHI",
  "^N225",
];
const items = (symbols: string[]) =>
  symbols.map((symbol) => ({ symbol, valid: true }));

describe("thin()", () => {
  it("leaves short series alone", () => {
    expect(thin([1, 2, 3], 30)).toEqual([1, 2, 3]);
    expect(
      thin(
        Array.from({ length: 30 }, (_, i) => i),
        30,
      ),
    ).toHaveLength(30);
  });
  it("reduces to the cap, keeping the first and last point and the order", () => {
    const xs = Array.from({ length: 253 }, (_, i) => i);
    const out = thin(xs, 30);
    expect(out).toHaveLength(30);
    expect(out[0]).toBe(0);
    expect(out[29]).toBe(252);
    for (let i = 1; i < out.length; i++)
      expect(out[i]).toBeGreaterThan(out[i - 1]);
  });
  it("never returns fewer than 2 points for a cap below 2 (returns input)", () => {
    expect(thin([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });
});

describe("normalizeSparkline()", () => {
  it("turns a recorded 6-week daily chart into <= 30 finite closes, oldest first", async () => {
    const pts = normalizeSparkline("AAPL", await readDashboard("spark-AAPL"));
    expect(pts.length).toBeGreaterThanOrEqual(20);
    expect(pts.length).toBeLessThanOrEqual(30);
    expect(pts.every((p) => Number.isFinite(p) && p > 0)).toBe(true);
  });
  it("converts pence to pounds, like the price", async () => {
    const pts = normalizeSparkline(
      "SHEL.L",
      await readDashboard("spark-SHEL.L"),
    );
    expect(Math.max(...pts)).toBeLessThan(100); // 3784 pence would be ~3784
    expect(pts.at(-1)!).toBeGreaterThan(20);
  });
  it("thins a long recording (the 1y chart) to 30 points", async () => {
    const { readRaw } = await import("../helpers/fake-yahoo");
    const pts = normalizeSparkline(
      "AAPL",
      await readRaw("AAPL", "chart-1y-1d"),
    );
    expect(pts).toHaveLength(30);
  });
  it("drops null rows and rejects an unusable payload", () => {
    const row = (d: string, c: number | null) => ({
      date: d,
      open: c,
      high: c,
      low: c,
      close: c,
      volume: 1,
    });
    const pts = normalizeSparkline("X", {
      meta: { currency: "USD" },
      quotes: [
        row("2026-11-02T00:00:00Z", 1),
        row("2026-11-03T00:00:00Z", null),
        row("2026-11-04T00:00:00Z", 3),
      ],
    });
    expect(pts).toEqual([1, 3]);
    expect(() => normalizeSparkline("X", "nope")).toThrow(ProviderError);
  });
});

describe("normalizeCoreBatch()", () => {
  it("returns a bundle per requested symbol and not_found for what Yahoo omitted", async () => {
    const rows = await readDashboard("quotes");
    const m = normalizeCoreBatch(
      ["AAPL", "ZZZNOTREAL123"],
      rows,
      new Date(DASH_AT),
    );
    expect(m.get("AAPL")).toMatchObject({ listing: { symbol: "AAPL" } });
    const missing = m.get("ZZZNOTREAL123");
    expect(missing).toBeInstanceOf(ProviderError);
    expect((missing as ProviderError).kind).toBe("not_found");
  });
  it("one unusable row fails only that symbol", () => {
    const m = normalizeCoreBatch(
      ["A", "B"],
      [
        { symbol: "A", currency: "USD", regularMarketPrice: 1 },
        { symbol: "B" /* no currency */, regularMarketPrice: 2 },
      ],
      new Date(DASH_AT),
    );
    expect(m.get("A")).not.toBeInstanceOf(ProviderError);
    expect((m.get("B") as ProviderError).kind).toBe("invalid_payload");
  });
  it("is case-insensitive on the echoed symbol and rejects a non-object payload", () => {
    const m = normalizeCoreBatch(
      ["^GSPC"],
      [{ symbol: "^gspc", currency: "USD", regularMarketPrice: 1 }],
      new Date(DASH_AT),
    );
    expect(m.get("^GSPC")).not.toBeInstanceOf(ProviderError);
    expect(() =>
      normalizeCoreBatch(["A"], "garbage", new Date(DASH_AT)),
    ).toThrow(ProviderError);
  });
});

describe("QuotesParamSchema (the ?symbols= query)", () => {
  const parse = (s: string) => QuotesParamSchema.safeParse(s);
  it("trims, upper-cases, de-duplicates and keeps the caller's order", () => {
    const r = parse(" aapl, MC.pa ,AAPL,,7203.t,^gspc,eurusd=x ");
    expect(r.success && r.data.map((i) => i.symbol)).toEqual([
      "AAPL",
      "MC.PA",
      "7203.T",
      "^GSPC",
      "EURUSD=X",
    ]);
    expect(r.success && r.data.every((i) => i.valid)).toBe(true);
  });
  it("accepts exactly 25 distinct symbols and refuses 26", () => {
    const n = (k: number) =>
      Array.from({ length: k }, (_, i) => `T${i}`).join(",");
    expect(parse(n(MAX_QUOTE_SYMBOLS)).success).toBe(true);
    expect(parse(n(MAX_QUOTE_SYMBOLS + 1)).success).toBe(false);
    // duplicates do not count towards the cap
    expect(parse(Array(40).fill("AAPL").join(",")).success).toBe(true);
  });
  it("refuses an empty list or an absurdly long query", () => {
    expect(parse("").success).toBe(false);
    expect(parse(" , ,").success).toBe(false);
    expect(parse("A".repeat(801)).success).toBe(false);
  });
  it("flags a bad ticker inline instead of failing the list", () => {
    const r = parse("AAPL,<script>,A B,X".padEnd(40, "Y") + ",MC.PA");
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.find((i) => i.symbol === "AAPL")?.valid).toBe(true);
    const bad = r.data.filter((i) => !i.valid);
    expect(bad.length).toBeGreaterThanOrEqual(2);
    for (const b of bad) expect(b.symbol.length).toBeLessThanOrEqual(20);
    expect(r.data.find((i) => i.symbol === "MC.PA")?.valid).toBe(true);
  });
});

describe("GET /api/quotes logic: DataService.getQuotes", () => {
  it("returns tile-sized quotes with fractions, major currency and a sparkline", async () => {
    const { service } = dash();
    const r = await service.getQuotes(items(["AAPL", "SHEL.L", "SPY"]));
    expect(r.meta).toMatchObject({ contractVersion: "0.3.0", stale: false });
    const aapl = r.entries[0].quote.value!;
    expect(r.entries[0].status).toBe("ok");
    expect(aapl).toMatchObject({
      symbol: "AAPL",
      priceCurrency: "USD",
      marketState: "POST",
      delayMinutes: 15,
    });
    // Yahoo says -1.5278522 (percent units): the contract says fraction.
    expect(aapl.changePercent).toBeCloseTo(-0.015278522, 6);
    expect(aapl.sparkline.value!.length).toBeLessThanOrEqual(30);
    expect(aapl.sparkline.value!.length).toBeGreaterThan(10);

    const shell = r.entries[1].quote.value!;
    expect(shell.priceCurrency).toBe("GBP");
    expect(shell.priceSubunit).toEqual({ quotedAs: "GBp", factor: 100 });
    expect(shell.price).toBeCloseTo(37.84, 2); // pence 3784 -> pounds
    expect(Math.abs(shell.sparkline.value!.at(-1)! - shell.price)).toBeLessThan(
      shell.price * 0.2,
    );
  });

  it("nextEarnings: upcoming date, stale past date dropped, ETF not applicable", async () => {
    const { service } = dash();
    const r = await service.getQuotes(items(["AAPL", "MC.PA", "SPY", "TSM"]));
    const by = Object.fromEntries(
      r.entries.map((e) => [e.symbol, e.quote.value!]),
    );
    expect(by.AAPL.nextEarnings.value).toEqual({
      date: "2027-01-28T21:00:00.000Z",
      isEstimate: true,
    });
    expect(by.TSM.nextEarnings.value?.date).toBe("2027-01-14T13:30:00.000Z");
    // LVMH: Yahoo still serves July 2026, more than 2 days old.
    expect(by["MC.PA"].nextEarnings).toEqual({
      value: null,
      reason: "not_provided_by_source",
    });
    expect(by.SPY.nextEarnings).toEqual({
      value: null,
      reason: "not_applicable_for_type",
    });
  });

  it("one unknown, one invalid, one good: per-symbol statuses, ONE batch, nothing invalid upstream", async () => {
    const { service, client } = dash();
    const r = await service.getQuotes([
      { symbol: "AAPL", valid: true },
      { symbol: "ZZZNOTREAL123", valid: true },
      { symbol: "A B", valid: false },
      { symbol: "MC.PA", valid: true },
    ]);
    expect(r.entries.map((e) => e.status)).toEqual([
      "ok",
      "not_found",
      "invalid",
      "ok",
    ]);
    expect(r.entries[1].quote).toEqual({
      value: null,
      reason: "not_provided_by_source",
    });
    expect(client.batches).toEqual([["AAPL", "ZZZNOTREAL123", "MC.PA"]]);
    // no chart call for the unknown or invalid symbols
    expect(client.chartSymbols.sort()).toEqual(["AAPL", "MC.PA"]);
    // the unknown one is remembered (negative cache): no second upstream call
    await service.getQuotes(items(["ZZZNOTREAL123"]));
    expect(client.calls.quotes).toBe(1);
  });

  it("a failing sparkline degrades only that sparkline", async () => {
    const { service } = dash({
      client: new FakeYahooClient({ failChartFor: ["MC.PA"] }),
    });
    const r = await service.getQuotes(items(["AAPL", "MC.PA"]));
    expect(r.entries.map((e) => e.status)).toEqual(["ok", "ok"]);
    expect(r.entries[1].quote.value!.price).toBeGreaterThan(0);
    expect(r.entries[1].quote.value!.sparkline).toEqual({
      value: null,
      reason: "provider_error",
    });
    expect(r.entries[0].quote.value!.sparkline.value).not.toBeNull();
  });

  it("Yahoo down on a cold list: every symbol `unavailable`, still a normal response", async () => {
    const { service } = dash({
      client: new FakeYahooClient({
        fail: { quotes: new ProviderError("upstream", "429") },
      }),
    });
    const r = await service.getQuotes(items(["AAPL", "MC.PA"]));
    expect(r.entries.map((e) => e.status)).toEqual([
      "unavailable",
      "unavailable",
    ]);
    expect(r.entries[0].quote.reason).toBe("provider_error");
  });

  it("Yahoo dies after a good load: served from the stale copy, flagged stale per symbol", async () => {
    const { service, client, clock } = dash();
    const good = await service.getQuotes(items(["AAPL", "MC.PA"]));
    clock.t += 3 * 3600_000; // everything soft-expired, stale copy still kept
    client.opts.fail = { quotes: new ProviderError("upstream", "429") };
    const r = await service.getQuotes(items(["AAPL", "MC.PA"]));
    expect(r.meta.stale).toBe(true);
    expect(r.entries.every((e) => e.stale && e.status === "ok")).toBe(true);
    expect(r.entries[0].quote.value!.price).toBe(
      good.entries[0].quote.value!.price,
    );
  });

  it("a stale symbol does not make its fresh neighbours stale", async () => {
    const { service, client, clock } = dash();
    await service.getQuotes(items(["AAPL"]));
    clock.t += 60_000; // AAPL soft-expired (45 s)
    client.opts.fail = { quotes: new ProviderError("upstream", "429") };
    const r = await service.getQuotes(items(["AAPL", "MC.PA"]));
    expect(r.entries[0]).toMatchObject({ status: "ok", stale: true });
    expect(r.entries[1]).toMatchObject({ status: "unavailable", stale: false });
  });

  it("refreshes the price after 45 s but NOT the sparkline (30 min)", async () => {
    const { service, client, clock } = dash();
    await service.getQuotes(items(["AAPL"]));
    clock.t += 46_000;
    await service.getQuotes(items(["AAPL"]));
    expect(client.calls.quotes).toBe(2);
    expect(client.calls.chart).toBe(1);
    clock.t += 31 * 60_000;
    await service.getQuotes(items(["AAPL"]));
    expect(client.calls.chart).toBe(2);
  });

  it("shares the cache with the stock page, in both directions", async () => {
    const { service, client } = dash();
    await service.getQuotes(items(["AAPL"]));
    await service.getStock("AAPL");
    expect(client.calls.quote).toBe(0); // the page re-used the batch's core entry
    expect(client.calls.quoteSummary).toBe(1);

    const b = dash();
    await b.service.getStock("MC.PA");
    await b.service.getQuotes(items(["MC.PA"]));
    expect(b.client.calls.quotes).toBe(0); // the watchlist re-used the page's core entry
  });
});

describe("cold start: many students, one dashboard", () => {
  it("15 parallel requests for the SAME 12-symbol list = ONE batched quote() and ONE chart per symbol", async () => {
    const { service, client } = dash({
      client: new FakeYahooClient({ delayMs: 30 }),
    });
    const results = await Promise.all(
      Array.from({ length: 15 }, () => service.getQuotes(items(TWELVE))),
    );
    expect(client.calls.quotes).toBe(1);
    expect(client.batches[0].sort()).toEqual([...TWELVE].sort());
    expect(client.calls.chart).toBe(12);
    expect([...new Set(client.chartSymbols)].sort()).toEqual(
      [...TWELVE].sort(),
    );
    for (const r of results) {
      expect(r.entries).toHaveLength(12);
      expect(r.entries.every((e) => e.status === "ok")).toBe(true);
    }
    // afterwards: zero upstream calls
    const before = client.totalCalls;
    await Promise.all(
      Array.from({ length: 15 }, () => service.getQuotes(items(TWELVE))),
    );
    expect(client.totalCalls).toBe(before);
  });

  it("15 requests over 5 'serverless instances' sharing one store: each symbol fetched exactly once", async () => {
    const clock = { t: DASH_AT };
    const store = new MemoryStore(() => clock.t); // stands in for Upstash
    const client = new FakeYahooClient({ delayMs: 40 });
    const instances = Array.from(
      { length: 5 },
      () => makeService({ client, store, clock }).service,
    );
    await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        instances[i % 5].getQuotes(items(TWELVE)),
      ),
    );
    // The invariant that protects Yahoo: no symbol is ever fetched twice...
    expect(client.batches.flat().sort()).toEqual([...TWELVE].sort());
    expect(client.chartSymbols.sort()).toEqual([...TWELVE].sort());
    // ...and with the in-memory stand-in (lock acquisition is atomic per instance) that is one call.
    expect(client.calls.quotes).toBe(1);
  });

  it("overlapping lists never fetch a shared symbol twice", async () => {
    const { service, client } = dash({
      client: new FakeYahooClient({ delayMs: 30 }),
    });
    await Promise.all([
      service.getQuotes(items(["AAPL", "MC.PA"])),
      service.getQuotes(items(["MC.PA", "7203.T"])),
      service.getQuotes(items(["7203.T", "AAPL", "TSM"])),
    ]);
    expect(client.batches.flat().sort()).toEqual([
      "7203.T",
      "AAPL",
      "MC.PA",
      "TSM",
    ]);
    expect(client.chartSymbols.sort()).toEqual([
      "7203.T",
      "AAPL",
      "MC.PA",
      "TSM",
    ]);
  });

  it("COUNT: a full dashboard load (market + 12 symbols) costs 2 quote() calls + 1 chart() per distinct symbol", async () => {
    const { service, client } = dash();
    const [market, quotes] = await Promise.all([
      service.getMarket(),
      service.getQuotes(items(TWELVE)),
    ]);
    expect(market.indices).toHaveLength(8);
    expect(quotes.entries).toHaveLength(12);
    // 12 watchlist + 8 index symbols; 4 overlap (^GSPC ^IXIC ^FCHI ^N225) and are fetched once
    const distinct = new Set([...TWELVE, ...MARKET_STRIP.map((s) => s.symbol)]);
    expect(client.calls.quotes).toBeLessThanOrEqual(2);
    expect(client.calls.chart).toBe(distinct.size);
    console.log(
      `[count] cold dashboard: ${client.calls.quotes} quote() + ${client.calls.chart} chart() = ${client.totalCalls} upstream calls (${distinct.size} distinct symbols)`,
    );
    // second load, same minute: nothing
    const before = client.totalCalls;
    await Promise.all([service.getMarket(), service.getQuotes(items(TWELVE))]);
    expect(client.totalCalls).toBe(before);
  });

  it("COUNT: one minute later the refresh is just the batched quotes, sparklines are not refetched", async () => {
    const m = dash();
    await Promise.all([
      m.service.getMarket(),
      m.service.getQuotes(items(TWELVE)),
    ]);
    const charts = m.client.calls.chart;
    const quotes = m.client.calls.quotes;
    m.clock.t += 61_000;
    await Promise.all([
      m.service.getMarket(),
      m.service.getQuotes(items(TWELVE)),
    ]);
    expect(m.client.calls.chart).toBe(charts);
    expect(m.client.calls.quotes - quotes).toBeLessThanOrEqual(2);
    console.log(
      `[count] one minute later: ${m.client.calls.quotes - quotes} quote() + 0 chart()`,
    );
  });
});

describe("Redis command count", () => {
  it("a fully warm /api/quotes read costs 2 MGETs (prices + sparklines), not 2 per symbol", async () => {
    const { service, store } = dash();
    await service.getQuotes(items(TWELVE));
    const spy = vi.spyOn(store, "get");
    const many = vi.spyOn(store, "getMany");
    await service.getQuotes(items(TWELVE));
    expect(spy).not.toHaveBeenCalled();
    expect(many).toHaveBeenCalledTimes(2);
  });
});

describe("GET /api/market logic: DataService.getMarket", () => {
  it("returns the 8-item strip with the right kinds and no misleading currencies", async () => {
    const { service } = dash();
    const r: MarketResponse = await service.getMarket();
    expect(r.meta).toMatchObject({ contractVersion: "0.3.0", stale: false });
    expect(r.indices.map((i) => i.symbol)).toEqual([
      "^GSPC",
      "^IXIC",
      "^FCHI",
      "^STOXX50E",
      "^N225",
      "EURUSD=X",
      "GC=F",
      "^TNX",
    ]);
    const kind = Object.fromEntries(r.indices.map((i) => [i.symbol, i.kind]));
    expect(kind).toMatchObject({
      "^GSPC": "index",
      "EURUSD=X": "fx",
      "^TNX": "yield",
      "GC=F": "future",
    });
    for (const i of r.indices) {
      expect(i.quote.value, i.symbol).not.toBeNull();
      expect(i.quote.value!.sparkline.value, i.symbol).not.toBeNull();
      expect(i.quote.value!.nextEarnings.reason).toBe(
        "not_applicable_for_type",
      );
      expect(i.quote.value!.priceCurrency, i.symbol).toBe(
        i.kind === "future" ? "USD" : null,
      );
    }
    const tnx = r.indices.find((i) => i.symbol === "^TNX")!.quote.value!;
    expect(tnx.price).toBeCloseTo(4.837, 3); // a percent LEVEL, not a price
  });

  it("status chips come from Yahoo's marketState of the reference index", async () => {
    const { service } = dash();
    const r = await service.getMarket();
    expect(r.status.map((s) => s.id)).toEqual(["us", "paris", "tokyo"]);
    for (const s of r.status) {
      expect(s.basis).toBe("yahoo");
      expect(s.isOpen).toBe(false); // recorded after the US close, Europe closed, Tokyo pre-open
    }
    expect(r.status[0]).toMatchObject({
      marketState: "POST",
      referenceSymbol: "^GSPC",
    });
    expect(r.status[1]).toMatchObject({ marketState: "CLOSED" }); // POSTPOST
    expect(r.status[2]).toMatchObject({ marketState: "CLOSED" }); // PREPRE
  });

  it("one index missing at Yahoo degrades one item, not the strip", async () => {
    const { service } = dash({
      client: new FakeYahooClient({ omit: ["^STOXX50E"] }),
    });
    const r = await service.getMarket();
    const bad = r.indices.find((i) => i.symbol === "^STOXX50E")!;
    expect(bad.quote.value).toBeNull();
    expect(r.indices.filter((i) => i.quote.value).length).toBe(7);
  });

  it("serves the stale strip when Yahoo fails, and stops trusting stale marketState for the chips", async () => {
    const { service, client, clock } = dash();
    await service.getMarket();
    clock.t += 2 * 3600_000;
    client.opts.fail = { quotes: new ProviderError("upstream", "429") };
    const r = await service.getMarket();
    expect(r.meta.stale).toBe(true);
    expect(r.indices.every((i) => i.stale && i.quote.value)).toBe(true);
    expect(r.status.every((s) => s.basis === "schedule")).toBe(true);
  });

  it("15 parallel /api/market loads = ONE batched quote() and 8 chart() calls", async () => {
    const { service, client } = dash({
      client: new FakeYahooClient({ delayMs: 30 }),
    });
    await Promise.all(Array.from({ length: 15 }, () => service.getMarket()));
    expect(client.calls.quotes).toBe(1);
    expect(client.calls.chart).toBe(8);
  });
});

describe("market status helpers", () => {
  const us = MARKETS[0];
  const paris = MARKETS[1];
  const tokyo = MARKETS[2];
  const at = (iso: string) => new Date(iso);

  it("schedule: weekday regular hours in each exchange's own time zone (Nov = standard time)", () => {
    // Tue 3 Nov 2026
    expect(
      scheduleState(us.timezone, us.sessions, at("2026-11-03T15:00:00Z")),
    ).toBe("REGULAR"); // 10:00 NY
    expect(
      scheduleState(us.timezone, us.sessions, at("2026-11-03T14:00:00Z")),
    ).toBe("CLOSED"); // 09:00 NY
    expect(
      scheduleState(paris.timezone, paris.sessions, at("2026-11-03T09:00:00Z")),
    ).toBe("REGULAR"); // 10:00 Paris
    expect(
      scheduleState(paris.timezone, paris.sessions, at("2026-11-03T16:00:00Z")),
    ).toBe("REGULAR"); // 17:00 Paris
    expect(
      scheduleState(paris.timezone, paris.sessions, at("2026-11-03T16:45:00Z")),
    ).toBe("CLOSED"); // 17:45 Paris, after the 17:30 close
  });
  it("schedule: Tokyo lunch break and weekends are closed", () => {
    expect(
      scheduleState(tokyo.timezone, tokyo.sessions, at("2026-11-03T01:00:00Z")),
    ).toBe("REGULAR"); // 10:00 JST
    expect(
      scheduleState(tokyo.timezone, tokyo.sessions, at("2026-11-03T03:00:00Z")),
    ).toBe("CLOSED"); // 12:00 JST lunch
    expect(
      scheduleState(tokyo.timezone, tokyo.sessions, at("2026-11-03T04:00:00Z")),
    ).toBe("REGULAR"); // 13:00 JST
    expect(
      scheduleState(us.timezone, us.sessions, at("2026-11-07T15:00:00Z")),
    ).toBe("CLOSED"); // Saturday
  });

  it("an open market from Yahoo shows isOpen=true; an unknown state falls back to the schedule", () => {
    const quote = (marketState: string) => ({
      value: { marketState } as never,
      reason: null,
    });
    const open = buildStatus(
      new Map([["^GSPC", { quote: quote("REGULAR"), stale: false }]]),
      at("2026-11-07T15:00:00Z"), // a Saturday: Yahoo wins when it is fresh
    );
    expect(open[0]).toMatchObject({
      isOpen: true,
      basis: "yahoo",
      marketState: "REGULAR",
    });
    const unknown = buildStatus(
      new Map([["^GSPC", { quote: quote("UNKNOWN"), stale: false }]]),
      at("2026-11-07T15:00:00Z"),
    );
    expect(unknown[0]).toMatchObject({ isOpen: false, basis: "schedule" });
  });
});

describe("response shapes are clean JSON", () => {
  it("no NaN / undefined anywhere in quotes or market responses", async () => {
    const { service } = dash();
    const q: QuotesResponse = await service.getQuotes(items(TWELVE));
    const m = await service.getMarket();
    for (const body of [q, m]) {
      const text = JSON.stringify(body);
      expect(text).not.toMatch(/NaN|undefined|Infinity/);
      JSON.parse(text, (_, v) => {
        if (typeof v === "number") expect(Number.isFinite(v)).toBe(true);
        return v;
      });
    }
  });
});
