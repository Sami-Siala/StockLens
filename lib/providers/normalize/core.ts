import "server-only";
import type { Listing, Metric, Quote } from "@/lib/contract";
import { ProviderError } from "../errors";
import { YahooQuoteSchema } from "../schemas";
import type { CoreBundle } from "../types";
import { resolveCurrency, scaleValue } from "../units";
import { instrumentType, marketState, miss, nn, ok, pct } from "./helpers";

/**
 * quote() payload -> listing + quote + the raw numbers compose() needs for key stats.
 * All percent-unit fields are converted to FRACTIONS here, and all price-like values are
 * converted from a quoted sub-unit (pence...) to the major unit.
 */
export function normalizeCore(
  symbol: string,
  raw: unknown,
  now: Date,
): CoreBundle {
  const parsed = YahooQuoteSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.symbol) {
    // Yahoo returns undefined / {} for an unknown ticker.
    throw new ProviderError("not_found", `No quote for ${symbol}`);
  }
  const q = parsed.data;
  const quotedCurrency = q.currency;
  if (!quotedCurrency) {
    throw new ProviderError(
      "invalid_payload",
      `Quote for ${symbol} has no currency`,
    );
  }
  const cur = resolveCurrency(quotedCurrency);
  const sc = (v: number | undefined) =>
    v === undefined ? null : scaleValue(v, cur.scale);
  const fin = q.financialCurrency
    ? resolveCurrency(q.financialCurrency).currency
    : null;

  const listing: Listing = {
    symbol: q.symbol ?? symbol,
    name: q.longName ?? q.shortName ?? symbol,
    shortName: q.shortName ?? null,
    quoteType: instrumentType(q.quoteType),
    exchange: q.fullExchangeName ?? q.exchange ?? "",
    exchangeCode: q.exchange ?? "",
    exchangeTimezone: q.exchangeTimezoneName ?? "UTC",
    priceCurrency: cur.currency,
    priceSubunit: cur.subunit,
    financialCurrency: fin,
    firstTradeDate: q.firstTradeDateMilliseconds ?? null,
  };

  const price = sc(q.regularMarketPrice);
  const quote: Metric<Quote> =
    price === null
      ? miss("not_provided_by_source")
      : ok({
          price: { amount: price, currency: cur.currency },
          change: sc(q.regularMarketChange),
          // quote() reports PERCENT units (-1.71 = -1.71 %): convert to a fraction.
          changePercent:
            q.regularMarketChangePercent === undefined
              ? null
              : pct(q.regularMarketChangePercent),
          previousClose: sc(q.regularMarketPreviousClose),
          open: sc(q.regularMarketOpen),
          dayHigh: sc(q.regularMarketDayHigh),
          dayLow: sc(q.regularMarketDayLow),
          volume: nn(q.regularMarketVolume),
          fiftyTwoWeekHigh: sc(q.fiftyTwoWeekHigh),
          fiftyTwoWeekLow: sc(q.fiftyTwoWeekLow),
          marketState: marketState(q.marketState),
          asOf: q.regularMarketTime ?? now.toISOString(),
          delayMinutes: nn(q.exchangeDataDelayedBy),
        });

  const dates: Array<{ date: string; isEstimate: boolean }> = [];
  for (const d of [q.earningsTimestampStart, q.earningsTimestamp]) {
    if (d)
      dates.push({ date: d, isEstimate: q.isEarningsDateEstimate ?? false });
  }

  return {
    listing,
    quote,
    raw: {
      scale: cur.scale,
      priceQuoted: nn(q.regularMarketPrice),
      marketCap: nn(q.marketCap),
      sharesOutstanding: nn(q.sharesOutstanding),
      trailingPE: nn(q.trailingPE),
      forwardPE: nn(q.forwardPE),
      epsTrailing: nn(q.epsTrailingTwelveMonths),
      epsForward: nn(q.epsForward),
      dividendRate: nn(q.dividendRate),
      dividendYield:
        q.dividendYield === undefined ? null : pct(q.dividendYield),
      earningsDates: dates,
    },
    fetchedAt: now.toISOString(),
  };
}

/**
 * quote([...]) result -> one bundle (or error) PER requested symbol. Rows are matched by the
 * symbol Yahoo echoes back (case-insensitive); a requested symbol with no row is `not_found`
 * (Yahoo omits unknown symbols), and one unusable row fails only that symbol.
 */
export function normalizeCoreBatch(
  symbols: string[],
  raw: unknown,
  now: Date,
): Map<string, CoreBundle | ProviderError> {
  const rows: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? [raw]
      : [];
  if (
    raw !== undefined &&
    raw !== null &&
    !Array.isArray(raw) &&
    typeof raw !== "object"
  )
    throw new ProviderError("invalid_payload", "Unusable batch quote payload");
  const bySymbol = new Map<string, unknown>();
  for (const row of rows) {
    const s = (row as { symbol?: unknown } | null)?.symbol;
    if (typeof s === "string") bySymbol.set(s.toUpperCase(), row);
  }
  const out = new Map<string, CoreBundle | ProviderError>();
  for (const symbol of symbols) {
    const row = bySymbol.get(symbol.toUpperCase());
    if (row === undefined) {
      out.set(symbol, new ProviderError("not_found", `No quote for ${symbol}`));
      continue;
    }
    try {
      out.set(symbol, normalizeCore(symbol, row, now));
    } catch (e) {
      out.set(
        symbol,
        e instanceof ProviderError
          ? e
          : new ProviderError(
              "invalid_payload",
              `Unusable quote for ${symbol}`,
            ),
      );
    }
  }
  return out;
}
