/**
 * GET /api/chart/AAPL?range=1D -> ChartResponse. Ranges: 1H 1D 1W 1M 1Y 3Y 5Y ALL.
 */
import "server-only";
import {
  apiError,
  guard,
  json,
  providerErrorResponse,
} from "@/lib/providers/http";
import { getService } from "@/lib/providers/runtime";
import { RangeSchema, SymbolSchema } from "@/lib/providers/schemas";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  request: Request,
  ctx: { params: Promise<{ symbol: string }> },
) {
  const blocked = await guard(request);
  if (blocked) return blocked;

  const symbol = SymbolSchema.safeParse((await ctx.params).symbol);
  if (!symbol.success)
    return apiError("bad_request", "Invalid ticker symbol.", 400);
  const range = RangeSchema.safeParse(
    new URL(request.url).searchParams.get("range") ?? "1D",
  );
  if (!range.success)
    return apiError(
      "bad_request",
      "range must be one of 1H, 1D, 1W, 1M, 1Y, 3Y, 5Y, ALL.",
      400,
    );

  try {
    return json(await getService().getChart(symbol.data, range.data));
  } catch (e) {
    return providerErrorResponse(e);
  }
}
