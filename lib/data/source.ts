import type {
  AiLanguage,
  ChartRange,
  ChartResponse,
  MarketResponse,
  QuotesResponse,
  SearchResponse,
  StockSnapshot,
  ThesisResponse,
  TickerResponse,
} from "@/lib/contract";

/** What both the fixtures and the live routes provide. */
export interface DataSourceApi {
  search(query: string, signal?: AbortSignal): Promise<SearchResponse>;
  stock(symbol: string, signal?: AbortSignal): Promise<StockSnapshot>;
  chart(
    symbol: string,
    range: ChartRange,
    signal?: AbortSignal,
  ): Promise<ChartResponse>;
  /** One batched call for many symbols (watchlist, starters, recents). */
  quotes(symbols: string[], signal?: AbortSignal): Promise<QuotesResponse>;
  /** Markets-now tile: three open/closed chips plus the index strip. */
  market(signal?: AbortSignal): Promise<MarketResponse>;
  /** The scrolling band under the header: 25 indices and macro rates, no sparklines. */
  ticker(signal?: AbortSignal): Promise<TickerResponse>;
  /**
   * The AI explanation. An unavailable AI is a NORMAL answer (`result.status === "unavailable"`),
   * not an error: only real transport / HTTP failures throw.
   */
  thesis(
    symbol: string,
    lang: AiLanguage,
    signal?: AbortSignal,
  ): Promise<ThesisResponse>;
}
