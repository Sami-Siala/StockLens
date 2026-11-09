/**
 * GET /api/ai/AAPL?lang=fr|en -> ThesisResponse (contract v0.4.0). An unavailable AI is a normal 200
 * answer (`result.status: "unavailable"`); only an unknown ticker, a bad request, a rate limit or a
 * dead market-data source are HTTP errors.
 */
import "server-only";
import { AI_CONFIG } from "@/lib/ai/config";
import { getAiService } from "@/lib/ai/runtime";
import {
  apiError,
  guard,
  json,
  providerErrorResponse,
} from "@/lib/providers/http";
import { SymbolSchema } from "@/lib/providers/schemas";

export const dynamic = "force-dynamic";
// The fallback chain takes up to ~50 s. A waiter may also wait ~50 s for another instance's generation
// and then generate itself if that instance died, so two chain lengths plus the stock fetch must fit.
export const maxDuration = 120;

export async function GET(
  request: Request,
  ctx: { params: Promise<{ symbol: string }> },
) {
  // Its own bucket and a much lower ceiling: this endpoint can spend our Gemini quota.
  const blocked = await guard(request, {
    bucket: "ai",
    limit: AI_CONFIG.ratePerMinutePerIp,
  });
  if (blocked) return blocked;

  const symbol = SymbolSchema.safeParse((await ctx.params).symbol);
  if (!symbol.success)
    return apiError("bad_request", "Invalid ticker symbol.", 400);

  const lang = new URL(request.url).searchParams.get("lang") ?? "en";
  if (lang !== "fr" && lang !== "en")
    return apiError("bad_request", "lang must be fr or en.", 400);

  try {
    return json(await getAiService().getThesis(symbol.data, lang));
  } catch (e) {
    return providerErrorResponse(e);
  }
}
