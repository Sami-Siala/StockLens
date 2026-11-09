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
import { QUOTES_MAX } from "./dashboard";
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

/**
 * One call per API-sized batch (the endpoint takes at most QUOTES_MAX symbols). A full watchlist,
 * the starters and the recents add up to more than that, and cutting the list would leave the last
 * rows without a price. The batches run together and the answers are merged in order.
 */
export async function getQuotes(
  symbols: string[],
  signal?: AbortSignal,
): Promise<QuotesResponse> {
  const src = await source();
  if (symbols.length <= QUOTES_MAX) return src.quotes(symbols, signal);
  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += QUOTES_MAX)
    batches.push(symbols.slice(i, i + QUOTES_MAX));
  const parts = await Promise.all(batches.map((b) => src.quotes(b, signal)));
  const [first] = parts;
  return {
    ...first,
    meta: {
      ...first.meta,
      stale: parts.some((p) => p.meta.stale),
      fetchedAt: parts.reduce(
        (oldest, p) => (p.meta.fetchedAt < oldest ? p.meta.fetchedAt : oldest),
        first.meta.fetchedAt,
      ),
    },
    entries: parts.flatMap((p) => p.entries),
  };
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
