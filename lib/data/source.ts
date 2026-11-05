import type {
  ChartRange,
  ChartResponse,
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
}
