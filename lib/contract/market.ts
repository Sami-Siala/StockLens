import type { ResponseMeta } from "./stock";
import type {
  CurrencyCode,
  InstrumentType,
  IsoTimestamp,
  MarketState,
  Money,
} from "./common";

/** One autocomplete hit from /api/search. */
export interface SearchHit {
  symbol: string;
  name: string;
  /** Display name of the exchange, e.g. "Paris". */
  exchange: string;
  /** Yahoo exchange code, e.g. "PAR". */
  exchangeCode: string;
  quoteType: InstrumentType;
  sector: string | null;
  industry: string | null;
}

export interface SearchResponse {
  query: string;
  hits: SearchHit[];
  /** Present on live responses (added in v0.2.0); older fixtures lack it. */
  meta?: ResponseMeta;
}

/**
 * Sub-unit conversion done by the provider. Yahoo quotes London stocks in pence ("GBp"),
 * Johannesburg in cents ("ZAc"), Tel Aviv in agorot ("ILA"). The provider divides every price
 * by `factor` and reports the MAJOR currency (GBP, ZAR, ILS) everywhere, so price, EPS and
 * analyst targets always share one unit.
 */
export interface PriceSubunit {
  /** What Yahoo calls it, e.g. "GBp". */
  quotedAs: CurrencyCode;
  /** Sub-units per major unit, e.g. 100 for pence. */
  factor: number;
}

/** Static identity of a listing. Slow-changing; cached for hours. */
export interface Listing {
  symbol: string;
  /** Long legal name when known, else the short name. */
  name: string;
  shortName: string | null;
  quoteType: InstrumentType;
  exchange: string;
  exchangeCode: string;
  /** IANA zone, e.g. "Europe/Paris". Needed to label candles in exchange time. */
  exchangeTimezone: string;
  /** Currency of `Quote` and chart prices (always a MAJOR unit: "GBP", never "GBp"). */
  priceCurrency: CurrencyCode;
  /** Set when Yahoo quoted a sub-unit (pence…) and the provider converted it. Added in v0.2.0. */
  priceSubunit?: PriceSubunit | null;
  /** Currency of the financial statements; null when unknown (ETFs). May differ from price. */
  financialCurrency: CurrencyCode | null;
  /** First trade date; used to know how far "All" can go. */
  firstTradeDate: IsoTimestamp | null;
}

/** Fast-moving price block. Cached 30–60 s. */
export interface Quote {
  price: Money;
  /** Absolute change vs. previous close, in price currency. */
  change: number | null;
  /** Fraction, 0.0058 = +0.58 %. */
  changePercent: number | null;
  previousClose: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  marketState: MarketState;
  /** When Yahoo last traded/updated this price. */
  asOf: IsoTimestamp;
  /** Per-exchange delay straight from Yahoo's `exchangeDataDelayedBy` (not a fixed 15). */
  delayMinutes: number | null;
}

export type ChartRange = "1H" | "1D" | "1W" | "1M" | "1Y" | "3Y" | "5Y" | "ALL";

export type ChartInterval = "1m" | "5m" | "15m" | "1h" | "1d" | "1wk" | "1mo";

/**
 * One OHLCV bar. `t` is UNIX SECONDS (UTC). Within a series `t` is strictly ascending
 * and unique, and null rows are already dropped (Lightweight Charts requires both).
 * Prices are in the listing's price currency (major unit) and are split-adjusted but NOT
 * dividend-adjusted (Yahoo `close`, not `adjclose`), so they match what the exchange printed.
 */
export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
}

export interface ChartSeries {
  symbol: string;
  range: ChartRange;
  interval: ChartInterval;
  currency: CurrencyCode;
  exchangeTimezone: string;
  /** Seconds east of UTC at the time of the series, for the exchange-time axis formatter. */
  gmtOffsetSeconds: number;
  candles: Candle[];
  /**
   * Reference close for the change display. For 1H/1D: the previous session's last close.
   * For longer ranges: the close just before the first candle (Yahoo `chartPreviousClose`).
   */
  previousClose: number | null;
  marketState: MarketState;
  /** True when the exchange is not in its regular session now (CLOSED / PRE / POST). Added in v0.2.0. */
  marketClosed?: boolean;
  /**
   * Set when the requested window had no bars (market closed / holiday) and we
   * returned the last available data instead, e.g. "last trading hour" for 1H.
   */
  fallback: "last_trading_hour" | "last_trading_day" | null;
}
