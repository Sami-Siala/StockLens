import type {
  ChartRange,
  ChartResponse,
  MarketResponse,
  QuotesResponse,
  SearchResponse,
  StockSnapshot,
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
}
