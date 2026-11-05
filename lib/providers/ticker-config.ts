import "server-only";
import type { IndexKind, TickerKind, TickerRegion } from "@/lib/contract";

/**
 * THE list behind GET /api/ticker (contract v0.3.1). Order here = display order, grouped by
 * region and never reshuffled (the band must not jump between loads). To add or drop an item,
 * edit only this file; `id` is the stable key the UI localises by, so never rename a shipped id.
 *
 * Every symbol was verified live against Yahoo on 2026-11-05 (all 25 returned a price in ONE
 * batched quote()). A symbol Yahoo stops serving should be removed here, not left as a
 * permanently "unavailable" item.
 */
export interface TickerSpec {
  id: string;
  label: string;
  region: TickerRegion;
  kind: TickerKind;
  symbol: string;
}

const s = (
  id: string,
  label: string,
  region: TickerRegion,
  kind: TickerKind,
  symbol: string,
): TickerSpec => ({ id, label, region, kind, symbol });

export const TICKER_SPECS: readonly TickerSpec[] = [
  // Americas
  s("sp500", "S&P 500", "americas", "index", "^GSPC"),
  s("dow", "Dow Jones", "americas", "index", "^DJI"),
  s("nasdaq", "Nasdaq Composite", "americas", "index", "^IXIC"),
  s("nasdaq100", "Nasdaq 100", "americas", "index", "^NDX"),
  s("russell2000", "Russell 2000", "americas", "index", "^RUT"),
  s("tsx", "S&P/TSX", "americas", "index", "^GSPTSE"),
  s("bovespa", "Bovespa", "americas", "index", "^BVSP"),
  // Europe
  s("cac40", "CAC 40", "europe", "index", "^FCHI"),
  s("dax", "DAX", "europe", "index", "^GDAXI"),
  s("ftse100", "FTSE 100", "europe", "index", "^FTSE"),
  s("eurostoxx50", "Euro Stoxx 50", "europe", "index", "^STOXX50E"),
  s("ibex35", "IBEX 35", "europe", "index", "^IBEX"),
  s("ftsemib", "FTSE MIB", "europe", "index", "FTSEMIB.MI"),
  s("smi", "SMI", "europe", "index", "^SSMI"),
  s("aex", "AEX", "europe", "index", "^AEX"),
  // Asia-Pacific
  s("nikkei225", "Nikkei 225", "asia_pacific", "index", "^N225"),
  s("hangseng", "Hang Seng", "asia_pacific", "index", "^HSI"),
  s("shanghai", "Shanghai Composite", "asia_pacific", "index", "000001.SS"),
  s("kospi", "KOSPI", "asia_pacific", "index", "^KS11"),
  s("nifty50", "Nifty 50", "asia_pacific", "index", "^NSEI"),
  s("asx200", "ASX 200", "asia_pacific", "index", "^AXJO"),
  // Other: volatility and the macro trio (same symbols and kinds as the dashboard strip)
  s("vix", "VIX", "other", "volatility", "^VIX"),
  s("eurusd", "EUR/USD", "other", "fx", "EURUSD=X"),
  s("gold", "Gold", "other", "future", "GC=F"),
  s("us10y", "US 10Y yield", "other", "yield", "^TNX"),
];

export const TICKER_SYMBOLS = TICKER_SPECS.map((t) => t.symbol);

/** The `IndexKind` whose formatting rules a ticker kind follows (the VIX is a plain index level). */
export const asIndexKind = (k: TickerKind): IndexKind =>
  k === "volatility" ? "index" : k;
