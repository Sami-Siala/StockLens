/**
 * GET /api/quotes?symbols=AAPL,MC.PA,7203.T -> QuotesResponse (contract v0.3.0).
 * Watchlist / starters / movers batch. ONE batched Yahoo quote() for the uncached symbols, one
 * cached daily chart per symbol for the sparkline; per-symbol failures come back inline.
 */
import "server-only";
import {
  apiError,
  guard,
  json,
  providerErrorResponse,
} from "@/lib/providers/http";
import { getService } from "@/lib/providers/runtime";
import { MAX_QUOTE_SYMBOLS, QuotesParamSchema } from "@/lib/providers/schemas";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const blocked = await guard(request);
  if (blocked) return blocked;

  const items = QuotesParamSchema.safeParse(
    new URL(request.url).searchParams.get("symbols") ?? "",
  );
  if (!items.success)
    return apiError(
      "bad_request",
      `Query \`symbols\` must list 1-${MAX_QUOTE_SYMBOLS} comma-separated tickers.`,
      400,
    );

  try {
    return json(await getService().getQuotes(items.data));
  } catch (e) {
    return providerErrorResponse(e);
  }
}
