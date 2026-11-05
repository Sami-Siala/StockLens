/**
 * THROWAWAY (PLAN §11 Step 1): proves whether Yahoo answers requests that come from
 * Vercel's datacenter IPs. Deploy it, point scripts/soak.ts at it, then DELETE this file
 * once the soak verdict is in. Not part of the product: Step 2's real routes replace it.
 *
 *   GET /api/spike?symbol=AAPL  ->  { ok, symbol, price, currency, ms }  (HTTP 200 / 502)
 */
import "server-only";
import YahooFinance from "yahoo-finance2";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ALLOWED = new Set(["AAPL", "MC.PA", "7203.T"]);
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export async function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get("symbol") ?? "AAPL";
  if (!ALLOWED.has(symbol))
    return Response.json(
      { ok: false, error: "symbol not allowed" },
      { status: 400 },
    );

  const t0 = Date.now();
  try {
    const q = await yf.quote(symbol, {}, { validateResult: false });
    return Response.json({
      ok: true,
      symbol,
      price: q.regularMarketPrice ?? null,
      currency: q.currency ?? null,
      ms: Date.now() - t0,
    });
  } catch (e) {
    // 502 so the soak script counts upstream failures (incl. 429) as non-200.
    return Response.json(
      {
        ok: false,
        symbol,
        error: e instanceof Error ? e.message.slice(0, 160) : "unknown",
        ms: Date.now() - t0,
      },
      { status: 502 },
    );
  }
}
