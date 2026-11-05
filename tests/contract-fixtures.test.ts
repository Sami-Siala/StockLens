import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ChartResponse, Metric, StockSnapshot } from "@/lib/contract";

const DIR = join(__dirname, "fixtures/contract");
const symbols = readdirSync(DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
  .map((d) => d.name);

const load = <T>(symbol: string, file: string): T =>
  JSON.parse(readFileSync(join(DIR, symbol, file), "utf8")) as T;

/** Walk any object and hand every Metric-shaped node to `fn`. */
function eachMetric(
  node: unknown,
  fn: (m: Metric<unknown>, path: string) => void,
  path = "",
): void {
  if (Array.isArray(node))
    return node.forEach((v, i) => eachMetric(v, fn, `${path}[${i}]`));
  if (!node || typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  if ("value" in o && "reason" in o && Object.keys(o).length === 2)
    fn(o as Metric<unknown>, path);
  for (const [k, v] of Object.entries(o))
    eachMetric(v, fn, path ? `${path}.${k}` : k);
}

describe("contract fixtures (recorded from real Yahoo payloads)", () => {
  it("covers the planned tickers: US, EU, Asia, ETF, ADR, bank, loss-maker, LSE", () => {
    expect(symbols.sort()).toEqual([
      "7203.T",
      "AAPL",
      "JPM",
      "MC.PA",
      "RIVN",
      "SHEL.L",
      "SPY",
      "TSM",
    ]);
  });

  describe.each(symbols)("%s", (symbol) => {
    const stock = load<StockSnapshot>(symbol, "stock.json");

    it("every Metric has a value XOR a reason, and never NaN", () => {
      let count = 0;
      eachMetric(stock, (m, path) => {
        count++;
        expect(m.value === null, `${path}: value/reason mismatch`).toBe(
          m.reason !== null,
        );
        if (typeof m.value === "number")
          expect(Number.isFinite(m.value), path).toBe(true);
      });
      expect(count).toBeGreaterThanOrEqual(4); // sparse ETFs have few sections
    });

    it("keeps ratios as fractions", () => {
      const q = stock.quote.value;
      if (q?.changePercent != null)
        expect(Math.abs(q.changePercent)).toBeLessThan(1);
      const y = stock.fundamentals.value?.keyStats.dividendYield.value;
      if (y != null) expect(y).toBeLessThan(0.5);
    });

    const charts = readdirSync(join(DIR, symbol)).filter((f) =>
      f.startsWith("chart-"),
    );

    it("has at least the 1W and 1Y charts", () => {
      expect(charts).toEqual(
        expect.arrayContaining(["chart-1W.json", "chart-1Y.json"]),
      );
    });

    it.each(charts)("%s has strictly ascending unique timestamps", (file) => {
      const series = load<ChartResponse>(symbol, file).series.value!;
      expect(series.candles.length).toBeGreaterThan(5);
      for (let i = 1; i < series.candles.length; i++) {
        expect(series.candles[i].t).toBeGreaterThan(series.candles[i - 1].t);
      }
      for (const c of series.candles) {
        for (const x of [c.o, c.h, c.l, c.c])
          expect(Number.isFinite(x)).toBe(true);
      }
    });
  });

  it("encodes the known real-world gaps", () => {
    const lvmh = load<StockSnapshot>("MC.PA", "stock.json").fundamentals.value!;
    expect(lvmh.quarterly.at(-1)!.revenue.reason).toBe("reported_less_often");
    expect(lvmh.annual.at(-1)!.revenue.reason).toBeNull();
    expect(
      load<StockSnapshot>("MC.PA", "stock.json").earnings.value!.lastQuarter
        .reason,
    ).toBe("not_provided_by_source");

    const spy = load<StockSnapshot>("SPY", "stock.json");
    expect(spy.fundamentals.reason).toBe("not_applicable_for_type");
    expect(spy.analysts.reason).toBe("not_applicable_for_type");

    const tsm = load<StockSnapshot>("TSM", "stock.json");
    expect(tsm.listing.priceCurrency).toBe("USD");
    expect(tsm.listing.financialCurrency).toBe("TWD");
    expect(tsm.analysts.value!.priceTarget.value!.currency).toBe("USD");
  });
});

describe("contract v0.2 additions (all additive)", () => {
  it("announces a v0.2+ contract and keeps every v0.1 field", () => {
    for (const symbol of symbols) {
      const s = load<StockSnapshot>(symbol, "stock.json");
      expect(["0.2.0", "0.3.0"]).toContain(s.meta.contractVersion);
      for (const k of [
        "listing",
        "quote",
        "profile",
        "fundamentals",
        "earnings",
        "analysts",
      ])
        expect(s, `${symbol}.${k}`).toHaveProperty(k);
    }
  });
  it("London is converted from pence and says so", () => {
    const s = load<StockSnapshot>("SHEL.L", "stock.json");
    expect(s.listing.priceCurrency).toBe("GBP");
    expect(s.listing.priceSubunit).toEqual({ quotedAs: "GBp", factor: 100 });
  });
  it("loss-maker and bank carry the right reasons", () => {
    const rivn = load<StockSnapshot>("RIVN", "stock.json").fundamentals.value!;
    expect(rivn.keyStats.trailingPE.reason).toBe("negative_earnings");
    const jpm = load<StockSnapshot>("JPM", "stock.json").fundamentals.value!;
    expect(jpm.quarterly.at(-1)!.operatingIncome.reason).toBe("not_reported");
  });
  it("closed-market 1H chart is flagged", () => {
    const c = load<ChartResponse>("7203.T", "chart-1H.json").series.value!;
    expect(c.marketClosed).toBe(true);
    expect(c.fallback).toBe("last_trading_hour");
  });
});
