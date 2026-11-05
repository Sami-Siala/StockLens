/**
 * GET /api/ticker -> TickerResponse (contract v0.3.1): the scrolling market band (about 25 major
 * indexes plus VIX, EUR/USD, gold, US 10-year yield). ONE batched Yahoo quote() for the symbols
 * that are not cached (~60 s), shared `core:SYMBOL` cache, never a chart call; a symbol that
 * fails is an inline `unavailable` item, not a failed route.
 */
import "server-only";
import { guard, json, providerErrorResponse } from "@/lib/providers/http";
import { getService } from "@/lib/providers/runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const blocked = await guard(request);
  if (blocked) return blocked;
  try {
    return json(await getService().getTicker());
  } catch (e) {
    return providerErrorResponse(e);
  }
}
