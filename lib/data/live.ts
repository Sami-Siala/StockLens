import type {
  AiLanguage,
  ApiError,
  ChartRange,
  ChartResponse,
  MarketResponse,
  QuotesResponse,
  SearchResponse,
  StockSnapshot,
  ThesisResponse,
  TickerResponse,
} from "@/lib/contract";
import { DataError } from "./errors";

/**
 * Live data: our own /api routes only. The browser never talks to Yahoo or Gemini.
 * Assumption (routes are built in parallel): they return the contract shapes above,
 * and errors as `ApiError` with a matching HTTP status.
 */
async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      signal,
      headers: { accept: "application/json" },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new DataError("network");
  }
  if (!res.ok) {
    let body: Partial<ApiError> | null = null;
    try {
      body = (await res.json()) as Partial<ApiError>;
    } catch {
      /* body is not JSON: fall through to the status mapping */
    }
    const code =
      body?.error?.code ??
      (res.status === 404
        ? "not_found"
        : res.status === 429
          ? "rate_limited"
          : res.status === 400
            ? "bad_request"
            : "upstream_unavailable");
    throw new DataError(code, body?.error?.message, body?.error?.retryAfter);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new DataError("internal");
  }
}

export const liveSource = {
  search: (query: string, signal?: AbortSignal) =>
    getJson<SearchResponse>(
      `/api/search?q=${encodeURIComponent(query)}`,
      signal,
    ),
  stock: (symbol: string, signal?: AbortSignal) =>
    getJson<StockSnapshot>(`/api/stock/${encodeURIComponent(symbol)}`, signal),
  chart: (symbol: string, range: ChartRange, signal?: AbortSignal) =>
    getJson<ChartResponse>(
      `/api/chart/${encodeURIComponent(symbol)}?range=${range}`,
      signal,
    ),
  quotes: (symbols: string[], signal?: AbortSignal) =>
    getJson<QuotesResponse>(
      `/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`,
      signal,
    ),
  market: (signal?: AbortSignal) =>
    getJson<MarketResponse>("/api/market", signal),
  ticker: (signal?: AbortSignal) =>
    getJson<TickerResponse>("/api/ticker", signal),
  /** Answers 200 even when the AI is unavailable (`result.status`); only real HTTP errors throw. */
  thesis: (symbol: string, lang: AiLanguage, signal?: AbortSignal) =>
    getJson<ThesisResponse>(
      `/api/ai/${encodeURIComponent(symbol)}?lang=${lang}`,
      signal,
    ),
};
