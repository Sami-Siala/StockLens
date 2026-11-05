import type {
  ApiError,
  ChartRange,
  ChartResponse,
  SearchResponse,
  StockSnapshot,
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
};
