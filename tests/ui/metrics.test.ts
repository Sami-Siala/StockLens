import { describe, expect, it } from "vitest";
import {
  epsVerdict,
  selectors,
  summarizeCandles,
} from "@/components/stock/metrics";
import { loadStock } from "./helpers";

describe("selectors", () => {
  it("falls back to annual figures for a semi-annual reporter (LVMH)", () => {
    const s = selectors(loadStock("MC.PA"));
    expect(s.revenue.ok).toBe(true);
    if (s.revenue.ok) expect(s.revenue.value.length).toBe("12M");
    expect(s.eps.ok).toBe(false);
  });
  it("gives a reason, not a value, for an ETF", () => {
    const s = selectors(loadStock("SPY"));
    expect(s.marketCap.ok).toBe(false);
    if (!s.marketCap.ok)
      expect(s.marketCap.reason).toBe("not_applicable_for_type");
  });
  it("labels the TSM statement currency separately from the price", () => {
    const s = selectors(loadStock("TSM"));
    expect(s.revenue.ok && s.revenue.value.currency).toBe("TWD");
  });
  it("never shows money without a currency", () => {
    const stock = loadStock("AAPL");
    if (stock.fundamentals.value)
      stock.fundamentals.value.financialCurrency = null;
    const s = selectors(stock);
    expect(s.revenue.ok).toBe(false);
  });
});

describe("epsVerdict / summarizeCandles", () => {
  it("classifies beat, miss and in line", () => {
    expect(epsVerdict(0.11, 0.0575)).toBe("beat");
    expect(epsVerdict(-0.2, -0.1)).toBe("miss");
    expect(epsVerdict(0, 0)).toBe("inline");
    expect(epsVerdict(0.1, Number.NaN)).toBe("beat");
  });
  it("summarises a series and ignores too-short ones", () => {
    const c = (t: number, v: number) => ({
      t,
      o: v,
      h: v + 1,
      l: v - 1,
      c: v,
      v: 0,
    });
    const s = summarizeCandles([c(1, 100), c(2, 110)]);
    expect(s?.changePercent).toBeCloseTo(0.1);
    expect(s?.high).toBe(111);
    expect(summarizeCandles([c(1, 100)])).toBeNull();
  });
});
