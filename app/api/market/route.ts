/**
 * GET /api/market -> MarketResponse (contract v0.3.0): open/closed chips for NYSE/Nasdaq,
 * Euronext Paris and Tokyo, plus the index strip. One cached batch (~60 s) for the whole class.
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
    return json(await getService().getMarket());
  } catch (e) {
    return providerErrorResponse(e);
  }
}
