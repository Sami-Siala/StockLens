import "server-only";
import type { ChartRange, ChartSeries, SearchHit } from "@/lib/contract";
import { ProviderError } from "./errors";
import { normalizeChart, periodStart, RANGE_PLANS } from "./normalize/chart";
import { normalizeCore } from "./normalize/core";
import { normalizeDetail } from "./normalize/detail";
import { normalizeSearch } from "./normalize/search";
import { SUMMARY_MODULES } from "./schemas";
import type { CoreBundle, DetailBundle, MarketDataProvider } from "./types";
import type { YahooClient } from "./yahoo-client";

const YEAR_MS = 366 * 864e5;

/** Yahoo (via yahoo-finance2) behind the MarketDataProvider interface. */
export class YahooProvider implements MarketDataProvider {
  readonly name = "yahoo" as const;

  constructor(
    private client: YahooClient,
    private clock: () => Date = () => new Date(),
  ) {}

  async search(query: string): Promise<SearchHit[]> {
    return normalizeSearch(await this.client.search(query));
  }

  async getCore(symbol: string): Promise<CoreBundle> {
    return normalizeCore(symbol, await this.client.quote(symbol), this.clock());
  }

  /**
   * quoteSummary (one call, all modules: Yahoo simply omits modules an instrument lacks, e.g.
   * for an ETF) + statements (quarterly and annual). The three calls fail independently: one
   * failing degrades its sections only. If ALL fail the whole bundle fails (so the cache can
   * serve its stale copy).
   */
  async getDetail(symbol: string): Promise<DetailBundle> {
    const now = this.clock();
    const period1 = new Date(now.getTime() - 3 * YEAR_MS);
    const [summary, quarterly, annual] = await Promise.allSettled([
      this.client.quoteSummary(symbol, SUMMARY_MODULES),
      this.client.fundamentalsTimeSeries(symbol, {
        period1,
        type: "quarterly",
      }),
      this.client.fundamentalsTimeSeries(symbol, { period1, type: "annual" }),
    ]);
    const all = [summary, quarterly, annual];
    if (all.every((r) => r.status === "rejected")) {
      const first = (all[0] as PromiseRejectedResult).reason;
      throw first instanceof ProviderError
        ? first
        : new ProviderError("upstream", "All Yahoo detail calls failed");
    }
    const value = <T>(r: PromiseSettledResult<T>) =>
      r.status === "fulfilled" ? r.value : null;
    // quoteSummary rejected as "not found" for an instrument with no fundamentals at all
    // (it does so for some indices/currencies): that is "absent", not "failed".
    const summaryAbsent =
      summary.status === "rejected" &&
      summary.reason instanceof ProviderError &&
      summary.reason.kind === "not_found";
    return normalizeDetail(
      {
        summary: summaryAbsent
          ? {}
          : (value(summary) as Record<string, unknown> | null),
        quarterly: value(quarterly),
        annual: value(annual),
      },
      now,
    );
  }

  async getChart(
    symbol: string,
    range: ChartRange,
    now: Date = this.clock(),
  ): Promise<ChartSeries> {
    const plan = RANGE_PLANS[range];
    const raw = await this.client.chart(symbol, {
      period1: periodStart(range, now),
      interval: plan.interval,
      includePrePost: plan.includePrePost,
    });
    return normalizeChart(symbol, range, raw, now);
  }
}
