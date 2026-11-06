/**
 * The ONE place the UI gets data from (frontend data-access layer).
 *
 * Switch with a single flag, `NEXT_PUBLIC_DATA_MODE`:
 *   - "fixtures" (default): recorded contract fixtures from tests/fixtures/contract/
 *   - "live": our own /api/search | /api/stock/[symbol] | /api/chart/[symbol] |
 *     /api/quotes | /api/market | /api/ticker | /api/ai/[symbol] routes
 *
 * The flag is inlined at build time, so with "live" the bundler drops the fixtures
 * branch and no fixture JSON reaches the production client bundle.
 */
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
import { liveSource } from "./live";
import type { DataSourceApi } from "./source";

export const DATA_MODE: "fixtures" | "live" =
  process.env.NEXT_PUBLIC_DATA_MODE === "live" ? "live" : "fixtures";

async function source(): Promise<DataSourceApi> {
  if (process.env.NEXT_PUBLIC_DATA_MODE === "live") return liveSource;
  return (await import("./fixtures")).fixtureSource;
}

export async function searchSymbols(
  query: string,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  return (await source()).search(query, signal);
}

export async function getStock(
  symbol: string,
  signal?: AbortSignal,
): Promise<StockSnapshot> {
  return (await source()).stock(symbol, signal);
}

export async function getChart(
  symbol: string,
  range: ChartRange,
  signal?: AbortSignal,
): Promise<ChartResponse> {
  return (await source()).chart(symbol, range, signal);
}

export async function getQuotes(
  symbols: string[],
  signal?: AbortSignal,
): Promise<QuotesResponse> {
  return (await source()).quotes(symbols, signal);
}

export async function getMarket(signal?: AbortSignal): Promise<MarketResponse> {
  return (await source()).market(signal);
}

export async function getTicker(signal?: AbortSignal): Promise<TickerResponse> {
  return (await source()).ticker(signal);
}

export async function getThesis(
  symbol: string,
  lang: AiLanguage,
  signal?: AbortSignal,
): Promise<ThesisResponse> {
  return (await source()).thesis(symbol, lang, signal);
}

export { DataError, isAbort } from "./errors";
