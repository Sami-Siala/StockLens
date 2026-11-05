import type { AnalystView, Earnings } from "./analysts";
import type { ContractVersion, IsoTimestamp, Metric } from "./common";
import type { Fundamentals } from "./fundamentals";
import type { ChartRange, ChartSeries, Listing, Quote } from "./market";

/**
 * Company description. Third-party text: it ends up in the AI prompt, so it is always
 * treated as DATA (delimited, never instructions) and rendered as plain text.
 */
export interface CompanyProfile {
  sector: string | null;
  industry: string | null;
  country: string | null;
  website: string | null;
  employees: number | null;
  summary: string | null;
}

export type DataSource = "yahoo" | "snapshot" | "fixture";

export interface ResponseMeta {
  contractVersion: ContractVersion;
  source: DataSource;
  fetchedAt: IsoTimestamp;
  /** True when served from the long-TTL stale copy or a snapshot because the live call failed. */
  stale: boolean;
  /**
   * Sections whose upstream module failed or was absent for a reason other than the instrument
   * type (the matching `Metric` carries `provider_error`). Added in v0.2.0.
   */
  degradedSections?: Array<
    "quote" | "profile" | "fundamentals" | "earnings" | "analysts"
  >;
}

/**
 * GET /api/stock/[symbol]. Every section is a `Metric` so one failed Yahoo module
 * degrades one card and never the page (PLAN §4.2). `listing` is the only required
 * block: without it there is nothing to render.
 */
export interface StockSnapshot {
  meta: ResponseMeta;
  listing: Listing;
  quote: Metric<Quote>;
  profile: Metric<CompanyProfile>;
  fundamentals: Metric<Fundamentals>;
  earnings: Metric<Earnings>;
  analysts: Metric<AnalystView>;
}

/** GET /api/chart/[symbol]?range=… */
export interface ChartResponse {
  meta: ResponseMeta;
  range: ChartRange;
  series: Metric<ChartSeries>;
}

export type ProviderStatus = "ok" | "degraded" | "down";

/** GET /api/health */
export interface HealthReport {
  status: ProviderStatus;
  checkedAt: IsoTimestamp;
  providers: Array<{
    name: DataSource | "gemini" | "upstash";
    status: ProviderStatus;
    lastSuccessAt: IsoTimestamp | null;
    /** Short, secret-free note such as "in-memory cache (Upstash not configured)". Added in v0.2.0. */
    detail?: string;
  }>;
}

/** Error body for any /api route (HTTP status carries the class). */
export interface ApiError {
  error: {
    code:
      | "bad_request"
      /** Origin/Referer check failed. Added in v0.2.0. */
      | "forbidden"
      /** Club code required or wrong. Added in v0.2.0. */
      | "unauthorized"
      | "not_found"
      | "rate_limited"
      | "upstream_unavailable"
      | "internal";
    message: string;
    /** Seconds, for `rate_limited`. */
    retryAfter?: number;
  };
}
