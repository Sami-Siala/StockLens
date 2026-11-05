import { describe, expect, it } from "vitest";
import { DATA_MODE, getChart, getStock, searchSymbols } from "@/lib/data";
import { DataError } from "@/lib/data/errors";

describe("data layer (fixtures mode, the default)", () => {
  it("defaults to fixtures", () => expect(DATA_MODE).toBe("fixtures"));

  it("returns contract-shaped stock data", async () => {
    const s = await getStock("aapl");
    expect(s.listing.symbol).toBe("AAPL");
    expect(s.meta.contractVersion).toBe("0.1.0");
  });

  it("answers not_found for an unknown symbol", async () => {
    await expect(getStock("NOPE")).rejects.toMatchObject({ code: "not_found" });
    await expect(getStock("NOPE")).rejects.toBeInstanceOf(DataError);
  });

  it("serves all 8 ranges; 1H on a closed market is labelled", async () => {
    for (const r of [
      "1H",
      "1D",
      "1W",
      "1M",
      "1Y",
      "3Y",
      "5Y",
      "ALL",
    ] as const) {
      const c = await getChart("MC.PA", r);
      expect(c.range).toBe(r);
      expect(c.series.value?.candles.length).toBeGreaterThan(1);
    }
    expect((await getChart("MC.PA", "1H")).series.value?.fallback).toBe(
      "last_trading_hour",
    );
    expect((await getChart("AAPL", "1H")).series.value?.fallback).toBeNull();
  });

  it("search finds companies by name or ticker", async () => {
    const r = await searchSymbols("apple");
    expect(r.hits.map((h) => h.symbol)).toContain("AAPL");
    expect((await searchSymbols("")).hits).toEqual([]);
    expect((await searchSymbols("lvmh")).hits.map((h) => h.symbol)).toContain(
      "MC.PA",
    );
  });
});
