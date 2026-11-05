/**
 * StockLens data contract v0.3 — TYPES ONLY (no runtime code, safe to import anywhere).
 *
 * Owner: data-engineer. Versioned, not frozen: additive v0.x changes are allowed,
 * breaking changes go through the orchestrator (PLAN §12).
 *
 * Conventions (all normalised by the provider layer, never by the UI):
 *  - Every ratio / percentage is a FRACTION: 0.0312 means 3.12 %. Yahoo mixes units
 *    (`quote.dividendYield` = 3.12 but `summaryDetail.dividendYield` = 0.0312, and
 *    `quote.regularMarketChangePercent` = 0.58 but `price.…` = 0.0058).
 *  - Every timestamp is an ISO-8601 UTC string, except chart candles (unix seconds,
 *    what Lightweight Charts wants).
 *  - Money always travels with its own currency. A stock has up to three currencies
 *    (price, financial statements, analyst target) and they can differ (TSM: USD / TWD / USD).
 *  - Anything that can be missing is a `Metric<T>`: `value` is null and `reason` says why,
 *    so the UI shows a clear "not available" state, never a blank or NaN.
 */

/**
 * v0.3.1 (market ticker band) is ADDITIVE over v0.3.0: `GET /api/ticker` -> `TickerResponse` (`TickerItem`,
 * `TickerRegion`, `TickerKind`, in `dashboard.ts`). Nothing was removed or renamed; every response now
 * reports `meta.contractVersion: "0.3.1"`.
 *
 * v0.3.0 (Step 3b, home dashboard) is ADDITIVE over v0.2.0: new file `dashboard.ts` (`QuoteLite`, `QuotesResponse`,
 * `MarketResponse`...) for `GET /api/quotes` and `GET /api/market`. Nothing was removed or renamed; existing
 * responses only change their `meta.contractVersion` to "0.3.0".
 *
 * v0.2.0 (Step 2) is ADDITIVE over v0.1.0: optional `Listing.priceSubunit`, optional `Fundamentals.primaryView`, optional
 * `ChartSeries.marketClosed`, optional `ResponseMeta.degradedSections`, two new `ApiError` codes
 * (`forbidden`, `unauthorized`) and an optional `HealthReport` detail. Nothing was removed or renamed.
 */
export type ContractVersion = "0.1.0" | "0.2.0" | "0.3.0" | "0.3.1";

/** ISO-8601 UTC timestamp, e.g. "2026-11-05T19:23:56.000Z". */
export type IsoTimestamp = string;
/** ISO-8601 calendar date, e.g. "2026-09-30". */
export type IsoDate = string;

/**
 * Currency code as Yahoo reports it. Includes sub-units: "GBp" (pence), "ZAc", "ILA".
 * The provider layer owns the unit table and converts sub-units before building `Money`
 * only when it can do so safely; otherwise it keeps the code and the UI must show it.
 */
export type CurrencyCode = string;

export interface Money {
  amount: number;
  currency: CurrencyCode;
}

export type UnavailableReason =
  /** ETF / index / crypto etc. have no such data. */
  | "not_applicable_for_type"
  /** Loss-maker: trailing P/E is undefined. */
  | "negative_earnings"
  /** Company does not report this line (banks / insurers / REITs often lack FCF…). */
  | "not_reported"
  /** Company reports it, but too rarely for this view (e.g. semi-annual reporters, no Q rows). */
  | "reported_less_often"
  /** The source simply has no value for this ticker. */
  | "not_provided_by_source"
  /** Values exist but in currencies we cannot safely compare, so the card is hidden. */
  | "currency_mismatch"
  /** The upstream call for this section failed (timeout, 429, shape change). */
  | "provider_error";

/** Present value, or null + reason. `reason` is null exactly when `value` is present. */
export type Metric<T> =
  { value: T; reason: null } | { value: null; reason: UnavailableReason };

export type InstrumentType =
  | "EQUITY"
  | "ETF"
  | "MUTUALFUND"
  | "INDEX"
  | "CRYPTOCURRENCY"
  | "CURRENCY"
  | "FUTURE"
  | "OTHER";

export type MarketState = "PRE" | "REGULAR" | "POST" | "CLOSED" | "UNKNOWN";
