/**
 * GET /api/stock/AAPL -> StockSnapshot (contract). Every section is a Metric: a failed or
 * missing Yahoo module degrades one card, never the response.
 */
import "server-only";
import {
  apiError,
  guard,
  json,
  providerErrorResponse,
} from "@/lib/providers/http";
import { getService } from "@/lib/providers/runtime";
import { SymbolSchema } from "@/lib/providers/schemas";

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

  try {
    return json(await getService().getStock(symbol.data));
  } catch (e) {
    return providerErrorResponse(e);
  }
}
