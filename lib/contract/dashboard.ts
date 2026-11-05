import type {
  CurrencyCode,
  InstrumentType,
  IsoTimestamp,
  MarketState,
  Metric,
} from "./common";
import type { NextEarnings } from "./analysts";
import type { PriceSubunit } from "./market";
import type { ResponseMeta } from "./stock";

/*
 * Home-dashboard contract (v0.3.0, ADDITIVE over v0.2.0; PLAN §4.3; `/api/ticker` added in v0.3.1).
 * Cheap batch endpoints feed every tile:
 *   GET /api/quotes?symbols=AAPL,MC.PA,7203.T   -> QuotesResponse   (watchlist, starters, movers, sectors)
 *   GET /api/market                              -> MarketResponse   (status chips + index strip)
 *   GET /api/ticker                              -> TickerResponse   (scrolling band, v0.3.1: no sparklines)
 * Same conventions as the rest of the contract: fractions for percentages, ISO timestamps,
 * `Metric<T>` for everything that can be missing, major currency units.
 */

/**
 * A tile-sized quote: enough for a watchlist row, an index chip or a mover, nothing more.
 * All money is in the MAJOR unit of `priceCurrency` (pence already converted, see `priceSubunit`).
 */
export interface QuoteLite {
  symbol: string;
  /** Long legal name when known, else the short name (whitespace collapsed). */
  name: string;
  exchange: string;
  quoteType: InstrumentType;
  /**
   * Major currency of `price`. `null` for instruments where a currency would mislead
   * (indices in points, FX rates, yields): see `MarketIndexItem.kind`.
   */
  priceCurrency: CurrencyCode | null;
  /** Set when Yahoo quoted a sub-unit (GBp, ZAc, ILA) and the provider converted it. */
  priceSubunit?: PriceSubunit | null;
  price: number;
  /** Absolute change vs. previous close, in the same unit as `price`. */
  change: number | null;
  /** Fraction, 0.0058 = +0.58 %. */
  changePercent: number | null;
  marketState: MarketState;
  /** Per-exchange delay from Yahoo's `exchangeDataDelayedBy`. */
  delayMinutes: number | null;
  /** When Yahoo last traded/updated this price. */
  asOf: IsoTimestamp;
  /**
   * Daily closes, oldest first, last ~6 weeks (about 30 trading days), thinned to at most 30
   * points, in the same unit as `price`. The last point is the latest (possibly partial) session.
   * Fetched and cached separately from the price (30 min), so it can be missing on its own:
   * `provider_error` (chart call failed), `not_provided_by_source` (fewer than 2 bars).
   */
  sparkline: Metric<number[]>;
  /**
   * Upcoming report date from the batched quote (no extra upstream call). Dates already more
   * than 2 days in the past are dropped (Yahoo keeps serving the last report):
   * `not_provided_by_source`, or `not_applicable_for_type` for ETFs, indices, FX, futures.
   */
  nextEarnings: Metric<NextEarnings>;
}

/**
 * Outcome for one requested symbol.
 *  - `ok`          `quote.value` is present (possibly `stale`).
 *  - `not_found`   Yahoo does not know the symbol.
 *  - `unavailable` the upstream call failed and no stale copy exists, or Yahoo returned no usable price.
 *  - `invalid`     not a legal ticker string; never sent upstream.
 * For every status except `ok`, `quote` is `{ value: null, reason }`.
 */
export type QuoteEntryStatus = "ok" | "not_found" | "unavailable" | "invalid";

export interface QuoteEntry {
  /** Normalised (trimmed, upper-case) symbol. */
  symbol: string;
  status: QuoteEntryStatus;
  quote: Metric<QuoteLite>;
  /** This symbol came from the stale copy because Yahoo failed. */
  stale: boolean;
}

/** GET /api/quotes?symbols=A,B,C  (1-25 symbols, de-duplicated, order preserved). */
export interface QuotesResponse {
  /** `meta.stale` is true when ANY entry is stale; `meta.fetchedAt` is the oldest entry. */
  meta: ResponseMeta;
  entries: QuoteEntry[];
}

/**
 * What kind of number an index-strip item is. The UI must format by kind and must NOT treat
 * `priceCurrency` as "money" for the first three:
 *  - `index`  a level in points (S&P 500, CAC 40...). `priceCurrency` is null.
 *  - `fx`     an exchange rate: price = units of the quote currency per 1 unit of the base
 *             (EUR/USD 1.12 = 1 euro costs 1.12 dollars). `priceCurrency` is null.
 *  - `yield`  an interest-rate LEVEL in percent (^TNX 4.84 = 4.84 %). Show `change` (percentage
 *             points), NOT `changePercent` (a relative move of the rate, which misleads).
 *             `priceCurrency` is null.
 *  - `future` a futures contract (gold, GC=F) priced in `priceCurrency` (USD per troy ounce).
 */
export type IndexKind = "index" | "fx" | "yield" | "future";

export interface MarketIndexItem {
  symbol: string;
  /** Neutral English label: "S&P 500", "EUR/USD", "Gold", "US 10-year yield". The UI may localise by symbol. */
  label: string;
  kind: IndexKind;
  /** `provider_error` when this item's data is unavailable; the other items still render. */
  quote: Metric<QuoteLite>;
  /** True when this item came from the stale copy. */
  stale: boolean;
}

export type MarketId = "us" | "paris" | "tokyo";

/** How a status chip was decided. */
export type MarketStatusBasis =
  /** Yahoo's `marketState` of the exchange's reference index (knows about holidays). */
  | "yahoo"
  /** Fallback: weekday + regular hours in the exchange's timezone (does NOT know holidays). */
  | "schedule";

export interface MarketStatus {
  id: MarketId;
  /** "NYSE / Nasdaq", "Euronext Paris", "Tokyo (TSE)". */
  label: string;
  exchangeTimezone: string;
  /** PRE / POST are extended hours; CLOSED includes overnight and weekends. */
  marketState: MarketState;
  /** True only for the regular session (`marketState === "REGULAR"`). */
  isOpen: boolean;
  basis: MarketStatusBasis;
  /** Reference index (`^GSPC`, `^FCHI`, `^N225`) the state came from, or null for `schedule`. */
  referenceSymbol: string | null;
}

export interface MarketOverview {
  status: MarketStatus[];
  indices: MarketIndexItem[];
}

/** GET /api/market. One cached batch (about 60 s); `meta.stale` is true when any item is stale. */
export interface MarketResponse extends MarketOverview {
  meta: ResponseMeta;
}

/* ------------------------------------------------------------- ticker band (v0.3.1) */

/** Where an instrument lives, for grouping in the band. `other` = VIX and the macro trio (EUR/USD, gold, US 10-year yield). */
export type TickerRegion = "americas" | "europe" | "asia_pacific" | "other";

/**
 * What kind of number a ticker item is; `IndexKind` plus `volatility`:
 *  - `volatility` the VIX: a level in points (28.18), no currency. Both `change` (points) and `changePercent`
 *                 are meaningful; show them like an index.
 * Format `index` / `fx` / `yield` / `future` exactly as documented on `IndexKind` (for `yield` show `change`
 * in percentage points, never `changePercent`).
 */
export type TickerKind = IndexKind | "volatility";

/**
 * One item of the band. `ok` means price/change/asOf are filled in; `unavailable` means Yahoo did not
 * serve it (failed call without a stale copy, unknown symbol, or no price): every number is `null`,
 * `marketState` is `UNKNOWN`. The route never fails because one symbol did: render the item as "n/a"
 * or skip it.
 */
export interface TickerItem {
  /** Stable machine id ("sp500", "cac40", "us10y"): key for i18n and React lists. Never changes once shipped. */
  id: string;
  /** Our own short English label ("S&P 500", "Euro Stoxx 50"), not Yahoo's padded name. */
  label: string;
  region: TickerRegion;
  kind: TickerKind;
  /** Yahoo symbol, e.g. "^GSPC". */
  symbol: string;
  /** Level (points, rate or yield in %, or price for the gold future). `null` when `status` is `unavailable`. */
  price: number | null;
  /** Absolute change vs. previous close in the unit of `price` (percentage points for `yield`). */
  change: number | null;
  /** Fraction, 0.0058 = +0.58 %. For `yield` do NOT display it (a relative move of the rate misleads). */
  changePercent: number | null;
  /**
   * Money currency of `price`; only the gold future has one ("USD"). `null` for indices, FX, yields
   * and VIX (points / rates are not money). Additive extra that makes the gold item unambiguous.
   */
  priceCurrency: CurrencyCode | null;
  marketState: MarketState;
  /** Per-exchange delay from Yahoo's `exchangeDataDelayedBy`. */
  delayMinutes: number | null;
  /** When Yahoo last traded/updated this price. */
  asOf: IsoTimestamp | null;
  status: "ok" | "unavailable";
  /** True when this item came from the stale copy because Yahoo failed. */
  stale: boolean;
}

/**
 * GET /api/ticker. `items` is in FIXED display order (Americas, Europe, Asia-Pacific, other), the same
 * on every call, whatever failed. `meta.stale` is true when ANY item is stale; `meta.fetchedAt` is the
 * oldest item. One batched upstream call per ~60 s for the whole class; never a chart call.
 */
export interface TickerResponse {
  meta: ResponseMeta;
  items: TickerItem[];
}
