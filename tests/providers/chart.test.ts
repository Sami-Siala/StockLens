import { describe, expect, it, vi } from "vitest";
import type { ChartRange } from "@/lib/contract";
import {
  normalizeChart,
  periodStart,
  RANGE_PLANS,
  toCandles,
} from "@/lib/providers/normalize/chart";
import { YahooProvider } from "@/lib/providers/yahoo";
import { FakeYahooClient, readRaw } from "../helpers/fake-yahoo";
import { RECORDED_AT } from "../helpers/setup";

vi.mock("server-only", () => ({}));

const provider = (now = RECORDED_AT) =>
  new YahooProvider(new FakeYahooClient(), () => now);
const RANGES: ChartRange[] = ["1H", "1D", "1W", "1M", "1Y", "3Y", "5Y", "ALL"];

describe("range plan (PLAN §3.4; chart() has no `range`, only period1/period2)", () => {
  it("maps all 8 ranges to the documented intervals", () => {
    expect(
      Object.fromEntries(RANGES.map((r) => [r, RANGE_PLANS[r].interval])),
    ).toEqual({
      "1H": "1m",
      "1D": "5m",
      "1W": "15m",
      "1M": "1h",
      "1Y": "1d",
      "3Y": "1wk",
      "5Y": "1wk",
      ALL: "1mo",
    });
  });
  it("period1 is `now - lookback`; ALL starts at 1970-01-02, never 0", () => {
    const now = new Date("2026-11-05T20:30:00Z");
    expect(periodStart("1Y", now).getTime()).toBe(now.getTime() - 366 * 864e5);
    expect(periodStart("ALL", now).toISOString()).toBe(
      "1970-01-02T00:00:00.000Z",
    );
    expect(periodStart("ALL", now).getTime()).toBeGreaterThan(0);
  });
  it("1H fetches enough 1m history to find the last trading hour over a weekend", () => {
    expect(RANGE_PLANS["1H"].lookbackMs).toBeGreaterThanOrEqual(3 * 864e5);
  });
});

describe("toCandles", () => {
  const row = (date: string, close: number | undefined, extra = {}) => ({
    date,
    open: close,
    high: close,
    low: close,
    close,
    volume: 10,
    ...extra,
  });
  it("drops null rows, sorts ascending, de-duplicates (last write wins)", () => {
    const c = toCandles(
      [
        row("2026-01-03T00:00:00Z", 3),
        row("2026-01-01T00:00:00Z", 1),
        row("2026-01-02T00:00:00Z", undefined), // Yahoo gap row
        row("2026-01-03T00:00:00Z", 33), // duplicate timestamp
        row("2026-01-04T00:00:00Z", 4, { open: undefined }), // partial row
        { date: undefined, open: 1, high: 1, low: 1, close: 1, volume: 1 },
      ],
      1,
    );
    expect(c.map((x) => x.c)).toEqual([1, 33]);
    expect(c.map((x) => x.t)).toEqual([1767225600, 1767398400]);
  });
  it("applies the pence scale to OHLC but never to volume", () => {
    const [c] = toCandles([row("2026-01-01T00:00:00Z", 3784)], 1 / 100);
    expect(c).toMatchObject({ o: 37.84, h: 37.84, l: 37.84, c: 37.84, v: 10 });
  });
});

describe("normalizeChart on recorded payloads", () => {
  for (const symbol of ["AAPL", "7203.T"]) {
    describe.each(RANGES)(`${symbol} %s`, (range) => {
      it("has strictly ascending, unique timestamps and finite OHLC", async () => {
        const s = await provider().getChart(symbol, range, RECORDED_AT);
        expect(s.range).toBe(range);
        expect(s.interval).toBe(RANGE_PLANS[range].interval);
        expect(s.candles.length).toBeGreaterThan(5);
        for (let i = 1; i < s.candles.length; i++)
          expect(s.candles[i].t).toBeGreaterThan(s.candles[i - 1].t);
        for (const c of s.candles) {
          for (const x of [c.o, c.h, c.l, c.c])
            expect(Number.isFinite(x)).toBe(true);
          expect(c.h).toBeGreaterThanOrEqual(c.l);
        }
      });
    });
  }

  it("1H while the market is open: exactly the last 60 minutes, no fallback", async () => {
    // AAPL's 1m recording was taken at 20:18 UTC, during the regular session.
    const now = new Date("2026-11-05T20:19:00Z");
    const s = await provider(now).getChart("AAPL", "1H", now);
    expect(s.marketState).toBe("REGULAR");
    expect(s.marketClosed).toBe(false);
    expect(s.fallback).toBeNull();
    const span = s.candles.at(-1)!.t - s.candles[0].t;
    expect(span).toBeLessThan(60 * 60);
    expect(span).toBeGreaterThan(50 * 60);
  });

  it("1H while the market is CLOSED: the last trading hour, flagged", async () => {
    // Tokyo closed at 06:30 UTC; "now" is 20:30 UTC the same day.
    const s = await provider().getChart("7203.T", "1H", RECORDED_AT);
    expect(s.marketState).toBe("CLOSED");
    expect(s.marketClosed).toBe(true);
    expect(s.fallback).toBe("last_trading_hour");
    expect(s.candles.length).toBeGreaterThan(30);
    expect(s.candles.length).toBeLessThanOrEqual(60);
    expect(new Date(s.candles.at(-1)!.t * 1000).toISOString()).toBe(
      "2026-11-05T06:30:00.000Z",
    );
  });

  it("1D shows ONE trading day; on a closed market it says which fallback it used", async () => {
    const s = await provider().getChart("7203.T", "1D", RECORDED_AT);
    const days = new Set(
      s.candles.map((c) =>
        new Date((c.t + s.gmtOffsetSeconds) * 1000).toISOString().slice(0, 10),
      ),
    );
    expect(days.size).toBe(1);
    expect(s.fallback).toBe("last_trading_day");
  });

  it("1W keeps at most 5 trading days of 15m bars", async () => {
    const s = await provider().getChart("7203.T", "1W", RECORDED_AT);
    const days = new Set(
      s.candles.map((c) =>
        new Date((c.t + s.gmtOffsetSeconds) * 1000).toISOString().slice(0, 10),
      ),
    );
    expect(days.size).toBeLessThanOrEqual(5);
    expect(days.size).toBeGreaterThanOrEqual(3);
  });

  it("carries currency, exchange timezone and UTC offset for the axis formatter", async () => {
    const s = await provider().getChart("7203.T", "1Y", RECORDED_AT);
    expect(s).toMatchObject({
      currency: "JPY",
      exchangeTimezone: "Asia/Tokyo",
      gmtOffsetSeconds: 32400,
    });
  });

  it("London prices are converted from pence", async () => {
    const s = await provider().getChart("SHEL.L", "1Y", RECORDED_AT);
    expect(s.currency).toBe("GBP");
    const last = s.candles.at(-1)!;
    expect(last.c).toBeGreaterThan(20);
    expect(last.c).toBeLessThan(60); // ~37 GBP, would be ~3700 in pence
  });

  it("an unusable payload is an error, an empty one is an empty series", async () => {
    expect(() => normalizeChart("X", "1Y", { nope: 1 }, RECORDED_AT)).toThrow(
      /Unusable/,
    );
    const raw = await readRaw<Record<string, unknown>>("AAPL", "chart-1y-1d");
    const empty = normalizeChart(
      "AAPL",
      "1Y",
      { ...raw, quotes: [] },
      RECORDED_AT,
    );
    expect(empty.candles).toEqual([]);
    expect(empty.previousClose).not.toBeUndefined();
  });
});
