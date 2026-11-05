import type { CurrencyCode, IsoDate, IsoTimestamp, Metric } from "./common";

/** One quarter's EPS: what the company reported vs. what analysts expected. */
export interface EarningsSurprise {
  quarterEnd: IsoDate;
  epsActual: number;
  epsEstimate: number;
  /** epsActual − epsEstimate. */
  difference: number;
  /** Fraction relative to the estimate: 0.0575 = beat by 5.75 %. Negative = miss. */
  surprise: number;
  currency: CurrencyCode;
}

/** Analyst forecast for an upcoming period (Yahoo `earningsTrend`). */
export interface Estimate {
  /** Yahoo period code: "0q" current quarter, "+1q", "0y" current year, "+1y". */
  period: "0q" | "+1q" | "0y" | "+1y";
  endDate: IsoDate;
  avg: number;
  low: number | null;
  high: number | null;
  analysts: number | null;
  /** Same measure one year earlier. */
  yearAgo: number | null;
  /** Fraction. */
  growth: number | null;
  currency: CurrencyCode;
}

/** Upcoming report date. The provider drops dates already in the past (Yahoo keeps serving the last one). */
export interface NextEarnings {
  /** Start of the expected earnings window. */
  date: IsoTimestamp;
  isEstimate: boolean;
}

/**
 * Earnings block. NOTE (PLAN §3.2): Yahoo has NO past revenue actual-vs-estimate.
 * Revenue only appears as `revenueEstimates` for the next periods.
 */
export interface Earnings {
  /** Latest reported quarter vs. expectation; often missing outside the US. */
  lastQuarter: Metric<EarningsSurprise>;
  /** Up to the last 4 quarters, oldest first. */
  history: EarningsSurprise[];
  next: Metric<NextEarnings>;
  epsEstimates: Estimate[];
  revenueEstimates: Estimate[];
}

/** Counts of analysts per bucket, for the stacked buy/hold/sell bar. */
export interface RatingCounts {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export interface PriceTarget {
  low: number;
  mean: number;
  median: number | null;
  high: number;
  analysts: number | null;
  /**
   * Currency of the target. Yahoo's `financialData.financialCurrency` is the
   * STATEMENT currency (TSM: TWD) and is wrong for targets (TSM target ≈ 587 USD),
   * so the provider decides this and hides the card with `currency_mismatch`
   * when the target is not plausible against the price.
   */
  currency: CurrencyCode;
}

export interface AnalystView {
  /** Current-month counts. */
  ratings: Metric<RatingCounts>;
  /** 1 = strong buy … 5 = strong sell (Yahoo `recommendationMean`). */
  ratingMean: Metric<number>;
  priceTarget: Metric<PriceTarget>;
}
