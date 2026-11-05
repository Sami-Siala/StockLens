import { describe, expect, it, vi } from "vitest";
import { normalizeCore } from "@/lib/providers/normalize/core";
import {
  ChartResultSchema,
  RangeSchema,
  SearchQuerySchema,
  SymbolSchema,
  TimeSeriesSchema,
  YahooQuoteSchema,
} from "@/lib/providers/schemas";
import { resolveCurrency, scaleValue } from "@/lib/providers/units";

vi.mock("server-only", () => ({}));

describe("currency units", () => {
  it.each([
    ["GBp", "GBP", 100],
    ["GBX", "GBP", 100],
    ["ZAc", "ZAR", 100],
    ["ILA", "ILS", 100],
  ])("%s -> %s (x1/%i)", (code, major, factor) => {
    const r = resolveCurrency(code);
    expect(r.currency).toBe(major);
    expect(r.subunit).toEqual({ quotedAs: code, factor });
    expect(scaleValue(3784, r.scale)).toBe(37.84);
  });
  it("leaves normal currencies alone", () => {
    expect(resolveCurrency("USD")).toEqual({
      currency: "USD",
      scale: 1,
      subunit: null,
    });
    expect(scaleValue(123.456, 1)).toBe(123.456);
  });
  it("does not leave float noise", () => {
    expect(scaleValue(123456, 1 / 100)).toBe(1234.56);
  });
});

describe("lenient zod schemas (one bad field must not fail the object)", () => {
  it("coerces dates from Date, ISO string and epoch seconds", () => {
    const iso = "2026-11-05T19:23:56.000Z";
    for (const v of [new Date(iso), iso, Date.parse(iso) / 1000]) {
      const r = YahooQuoteSchema.parse({ regularMarketTime: v });
      expect(r.regularMarketTime).toBe(iso);
    }
  });
  it("turns wrong types, NaN and Infinity into undefined", () => {
    const r = YahooQuoteSchema.parse({
      regularMarketPrice: "12.3",
      trailingPE: Number.NaN,
      marketCap: Infinity,
      symbol: 42,
      forwardPE: 11.5,
    });
    expect(r.regularMarketPrice).toBeUndefined();
    expect(r.trailingPE).toBeUndefined();
    expect(r.marketCap).toBeUndefined();
    expect(r.symbol).toBeUndefined();
    expect(r.forwardPE).toBe(11.5);
  });
  it("accepts an object with missing keys (Yahoo omits keys freely)", () => {
    expect(() => YahooQuoteSchema.parse({})).not.toThrow();
  });
  it("drops bad array items one by one", () => {
    const rows = TimeSeriesSchema.parse([
      { date: "2026-09-30", periodType: "3M", totalRevenue: 5 },
      "garbage",
      null,
      { date: "2026-06-30", periodType: "3M", totalRevenue: "x" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[1].totalRevenue).toBeUndefined();
    expect(TimeSeriesSchema.parse("nope")).toEqual([]);
  });
  it("tolerates an unexpected new field and a changed nested shape in a chart", () => {
    const r = ChartResultSchema.parse({
      meta: {
        currency: "USD",
        brandNewField: { a: 1 },
        currentTradingPeriod: 7,
      },
      quotes: [{ date: "2026-01-01T00:00:00Z", close: 1, surprise: true }],
    });
    expect(r.meta.currentTradingPeriod).toBeUndefined();
    expect(r.quotes).toHaveLength(1);
  });
});

describe("input validation", () => {
  it.each(["AAPL", "mc.pa", "7203.T", "BRK-B", "^GSPC", "EURUSD=X"])(
    "accepts %s and uppercases it",
    (s) => expect(SymbolSchema.parse(s)).toBe(s.toUpperCase()),
  );
  it.each([
    "",
    "A B",
    "AAPL;DROP",
    "../etc",
    "<script>",
    "X".repeat(21),
    "a/b",
  ])("rejects %j", (s) =>
    expect(SymbolSchema.safeParse(s).success).toBe(false),
  );
  it("range is case-insensitive and closed", () => {
    expect(RangeSchema.parse("1h")).toBe("1H");
    expect(RangeSchema.parse("all")).toBe("ALL");
    expect(RangeSchema.safeParse("2Y").success).toBe(false);
  });
  it("search query is cleaned and bounded", () => {
    expect(SearchQuerySchema.parse("  lvmh \n\tmoet ")).toBe("lvmh moet");
    expect(SearchQuerySchema.safeParse("   ").success).toBe(false);
    expect(SearchQuerySchema.safeParse("x".repeat(61)).success).toBe(false);
  });
});

describe("quote normaliser guards", () => {
  const now = new Date("2026-11-05T20:00:00Z");
  it("unknown ticker (undefined / {} payload) is not_found", () => {
    for (const raw of [undefined, null, {}, "html"]) {
      expect(() => normalizeCore("ZZZ", raw, now)).toThrow(/No quote/);
    }
  });
  it("no currency is an invalid payload, not a guess", () => {
    expect(() =>
      normalizeCore("X", { symbol: "X", regularMarketPrice: 1 }, now),
    ).toThrow(/no currency/);
  });
  it("a quote without a price degrades to a reason, not a crash", () => {
    const c = normalizeCore("X", { symbol: "X", currency: "USD" }, now);
    expect(c.quote).toEqual({ value: null, reason: "not_provided_by_source" });
    expect(c.listing.exchangeTimezone).toBe("UTC");
  });
});
