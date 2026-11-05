import "server-only";
import type { ProviderError } from "./errors";
import type {
  AnalystView,
  ChartRange,
  CompanyProfile,
  EarningsSurprise,
  Estimate,
  FinancialPeriod,
  IsoTimestamp,
  Listing,
  Metric,
  PriceTarget,
  Quote,
  SearchHit,
  ChartSeries,
} from "@/lib/contract";

/**
 * The seam between "where data comes from" and the rest of the app (PLAN §7).
 * `YahooProvider` is the real one; a snapshot provider or a US-only fallback can implement the
 * same interface later. Everything returned is already normalised to the contract.
 *
 * A stock page needs two bundles because they age differently (PLAN §7 TTLs):
 *   core   = quote + listing + live key-stat inputs   (cached 30-60 s)
 *   detail = profile, statements, earnings, analysts  (cached 12 h)
 * `composeStock()` merges them into the contract's `StockSnapshot`.
 */
export interface MarketDataProvider {
  readonly name: "yahoo" | "snapshot";
  search(query: string): Promise<SearchHit[]>;
  getCore(symbol: string): Promise<CoreBundle>;
  /**
   * Many core bundles in ONE upstream call (dashboard batch). Every requested symbol appears in
   * the map: either its bundle, or the `ProviderError` explaining why not (`not_found` when Yahoo
   * omitted it, `invalid_payload` when its row was unusable). A failed CALL throws instead.
   */
  getCores(symbols: string[]): Promise<Map<string, CoreBundle | ProviderError>>;
  /**
   * Daily closes for a dashboard sparkline (last ~6 weeks, thinned to <= 30 points, major unit).
   * May return fewer than 2 points for very young listings; the service reports that as missing.
   */
  getSparkline(symbol: string, now?: Date): Promise<number[]>;
  getDetail(symbol: string): Promise<DetailBundle>;
  getChart(symbol: string, range: ChartRange, now?: Date): Promise<ChartSeries>;
}

/** Numbers exactly as Yahoo gave them (price-like values in the QUOTED unit, e.g. pence). */
export interface RawLiveStats {
  /** Multiply quoted sub-unit values by this to get major units (1 for normal currencies). */
  scale: number;
  priceQuoted: number | null;
  marketCap: number | null;
  sharesOutstanding: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  epsTrailing: number | null;
  epsForward: number | null;
  dividendRate: number | null;
  /** FRACTION (quote() reports percent; converted here). */
  dividendYield: number | null;
  /** Candidate dates for the next report, as Yahoo gave them (may be in the past). */
  earningsDates: Array<{ date: IsoTimestamp; isEstimate: boolean }>;
}

export interface CoreBundle {
  listing: Listing;
  quote: Metric<Quote>;
  raw: RawLiveStats;
  fetchedAt: IsoTimestamp;
}

/** Analyst target before the plausibility guard (needs the live price, so composed later). */
export interface RawPriceTarget {
  low: number;
  mean: number;
  median: number | null;
  high: number;
  analysts: number | null;
}

export type SectionName =
  "quote" | "profile" | "fundamentals" | "earnings" | "analysts";

export interface DetailBundle {
  fetchedAt: IsoTimestamp;
  /** From the quoteType module; null when absent. */
  quoteType: string | null;
  profile: Metric<CompanyProfile>;
  /** Resolved MAJOR currency of the statements, null when unknown. */
  financialCurrency: string | null;
  stats: {
    dividendYield: Metric<number>;
    dividendRate: Metric<number>;
    payoutRatio: Metric<number>;
    operatingMargin: Metric<number>;
    revenueGrowth: Metric<number>;
    beta: Metric<number>;
    sharesOutstanding: Metric<number>;
  };
  quarterly: FinancialPeriod[];
  annual: FinancialPeriod[];
  /** False when the time-series call itself failed (as opposed to "returned nothing"). */
  statementsOk: boolean;
  earnings: {
    status: Metric<true>;
    history: EarningsSurprise[];
    epsEstimates: Estimate[];
    revenueEstimates: Estimate[];
    /** Date from calendarEvents (may be in the past). */
    calendarDate: { date: IsoTimestamp; isEstimate: boolean } | null;
  };
  analysts: {
    status: Metric<true>;
    ratings: AnalystView["ratings"];
    ratingMean: AnalystView["ratingMean"];
    target: RawPriceTarget | null;
  };
  /** Sections whose module existed but had an unusable shape, or whose call failed. */
  degraded: SectionName[];
}

export type { PriceTarget };
