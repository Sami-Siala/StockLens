import type { CurrencyCode, IsoDate, Metric, Money } from "./common";

/** Reporting window of a financial-statement row. */
export type PeriodLength = "3M" | "6M" | "12M";

/**
 * One row of financial statements. All money is in `Fundamentals.financialCurrency`
 * (absolute amounts, not thousands/millions). Each line is independently optional:
 * a semi-annual reporter such as LVMH returns "quarterly" rows holding balance-sheet
 * lines only, with every income / cash-flow line missing.
 */
export interface FinancialPeriod {
  periodEnd: IsoDate;
  length: PeriodLength;
  revenue: Metric<number>;
  operatingIncome: Metric<number>;
  netIncome: Metric<number>;
  freeCashFlow: Metric<number>;
  operatingCashFlow: Metric<number>;
  /** Diluted EPS for the period, in financial currency per share. */
  dilutedEps: Metric<number>;
}

/** Snapshot ratios and sizes. */
export interface KeyStats {
  marketCap: Metric<Money>;
  sharesOutstanding: Metric<number>;
  trailingPE: Metric<number>;
  forwardPE: Metric<number>;
  trailingEps: Metric<Money>;
  forwardEps: Metric<Money>;
  /** Fraction: 0.0312 = 3.12 %. */
  dividendYield: Metric<number>;
  /** Annual dividend per share. */
  dividendRate: Metric<Money>;
  /** DPR as a fraction: 0.5925 = 59.25 %. */
  payoutRatio: Metric<number>;
  /** Fraction. */
  operatingMargin: Metric<number>;
  /** Fraction, year-over-year. */
  revenueGrowth: Metric<number>;
  beta: Metric<number>;
}

export interface Fundamentals {
  financialCurrency: CurrencyCode | null;
  keyStats: KeyStats;
  /** Oldest first. May be empty (ETFs) or hollow (semi-annual reporters). */
  quarterly: FinancialPeriod[];
  /** Oldest first, up to the last ~3 fiscal years. */
  annual: FinancialPeriod[];
}
