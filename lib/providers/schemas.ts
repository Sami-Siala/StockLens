import "server-only";
import { z } from "zod";

/**
 * zod schemas for everything external.
 *
 * Philosophy (PLAN §3.2): yahoo-finance2's own validation is switched off, and OUR schemas are
 * deliberately lenient at the FIELD level: a field with an unexpected type becomes `undefined`
 * instead of failing the whole object. Only "this is not even an object" fails. So a Yahoo shape
 * change degrades one field/card and never a route. Each quoteSummary module and each array item
 * is parsed on its own for the same reason.
 */

/**
 * Zod 4 treats a bare `z.unknown()` as a REQUIRED key; Yahoo omits keys freely, so every field
 * schema starts from `.optional()` (key may be missing) and then coerces.
 */
const any = z.unknown().optional();

/** Finite number or undefined (NaN, Infinity, strings, nested objects all become undefined). */
export const num = any.transform((v) =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined,
);

/** Non-empty string or undefined. */
export const str = any.transform((v) =>
  typeof v === "string" && v.trim() ? v.trim() : undefined,
);

export const bool = any.transform((v) =>
  typeof v === "boolean" ? v : undefined,
);

/**
 * Date-like to ISO-8601 string. yahoo-finance2 hands back `Date` objects at runtime and our
 * recorded fixtures hold ISO strings; raw Yahoo uses epoch seconds. All three are accepted.
 */
export const isoDate = any.transform((v) => {
  let ms: number | undefined;
  if (v instanceof Date) ms = v.getTime();
  else if (typeof v === "string" && v.trim()) ms = Date.parse(v);
  else if (typeof v === "number" && Number.isFinite(v))
    ms = v < 1e11 ? v * 1000 : v; // seconds vs milliseconds
  return ms !== undefined && Number.isFinite(ms)
    ? new Date(ms).toISOString()
    : undefined;
});

/** Array whose invalid items are dropped one by one (never throws). */
function lenientArray<S extends z.ZodType>(item: S) {
  return any.transform((v): Array<z.output<S>> => {
    if (!Array.isArray(v)) return [];
    const out: Array<z.output<S>> = [];
    for (const x of v) {
      const r = item.safeParse(x);
      if (r.success) out.push(r.data);
    }
    return out;
  });
}

/** ISO string or undefined items, with undefined dropped. */
const isoDateList = any.transform((v): string[] => {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    const r = isoDate.safeParse(x);
    if (r.success && r.data) out.push(r.data);
  }
  return out;
});

/* ------------------------------------------------------------------ quote() */

export const YahooQuoteSchema = z.object({
  symbol: str,
  quoteType: str,
  shortName: str,
  longName: str,
  exchange: str,
  fullExchangeName: str,
  exchangeTimezoneName: str,
  currency: str,
  financialCurrency: str,
  firstTradeDateMilliseconds: isoDate,
  regularMarketPrice: num,
  regularMarketChange: num,
  /** PERCENT units here (-1.71 = -1.71 %), unlike summaryDetail (fractions). */
  regularMarketChangePercent: num,
  regularMarketPreviousClose: num,
  regularMarketOpen: num,
  regularMarketDayHigh: num,
  regularMarketDayLow: num,
  regularMarketVolume: num,
  fiftyTwoWeekHigh: num,
  fiftyTwoWeekLow: num,
  marketState: str,
  regularMarketTime: isoDate,
  exchangeDataDelayedBy: num,
  marketCap: num,
  sharesOutstanding: num,
  trailingPE: num,
  forwardPE: num,
  epsTrailingTwelveMonths: num,
  epsForward: num,
  dividendRate: num,
  /** PERCENT units here (3.12 = 3.12 %). */
  dividendYield: num,
  earningsTimestamp: isoDate,
  earningsTimestampStart: isoDate,
  isEarningsDateEstimate: bool,
});
export type YahooQuote = z.output<typeof YahooQuoteSchema>;

/* ---------------------------------------------------------- quoteSummary() */

export const SummaryDetailSchema = z.object({
  /** FRACTION here (0.0312 = 3.12 %). */
  dividendYield: num,
  dividendRate: num,
  payoutRatio: num,
  beta: num,
  trailingPE: num,
  forwardPE: num,
  marketCap: num,
});

export const DefaultKeyStatisticsSchema = z.object({
  beta: num,
  sharesOutstanding: num,
  trailingEps: num,
  forwardEps: num,
});

export const FinancialDataSchema = z.object({
  currentPrice: num,
  targetHighPrice: num,
  targetLowPrice: num,
  targetMeanPrice: num,
  targetMedianPrice: num,
  recommendationMean: num,
  numberOfAnalystOpinions: num,
  operatingMargins: num,
  revenueGrowth: num,
  financialCurrency: str,
});

const EarningsHistoryItem = z.object({
  quarter: isoDate,
  epsActual: num,
  epsEstimate: num,
  epsDifference: num,
  surprisePercent: num,
  currency: str,
});
export const EarningsHistorySchema = z.object({
  history: lenientArray(EarningsHistoryItem),
});

const EstimateBlock = z
  .object({
    avg: num,
    low: num,
    high: num,
    numberOfAnalysts: num,
    yearAgoEps: num,
    yearAgoRevenue: num,
    growth: num,
    earningsCurrency: str,
    revenueCurrency: str,
  })
  .optional()
  .catch(undefined);
const EarningsTrendItem = z.object({
  period: str,
  endDate: isoDate,
  earningsEstimate: EstimateBlock,
  revenueEstimate: EstimateBlock,
});
export const EarningsTrendSchema = z.object({
  trend: lenientArray(EarningsTrendItem),
});

const RecommendationItem = z.object({
  period: str,
  strongBuy: num,
  buy: num,
  hold: num,
  sell: num,
  strongSell: num,
});
export const RecommendationTrendSchema = z.object({
  trend: lenientArray(RecommendationItem),
});

export const AssetProfileSchema = z.object({
  sector: str,
  industry: str,
  country: str,
  website: str,
  fullTimeEmployees: num,
  longBusinessSummary: str,
});

export const CalendarEventsSchema = z.object({
  earnings: z
    .object({
      earningsDate: isoDateList,
      isEarningsDateEstimate: bool,
    })
    .optional()
    .catch(undefined),
});

export const QuoteTypeSchema = z.object({
  quoteType: str,
  longName: str,
  shortName: str,
});

/** Modules we ask for. `price` is not needed: `quote()` carries the live price. */
export const SUMMARY_MODULES = [
  "quoteType",
  "summaryDetail",
  "defaultKeyStatistics",
  "financialData",
  "earningsHistory",
  "earningsTrend",
  "recommendationTrend",
  "assetProfile",
  "calendarEvents",
] as const;
export type SummaryModule = (typeof SUMMARY_MODULES)[number];

export const SUMMARY_SCHEMAS = {
  quoteType: QuoteTypeSchema,
  summaryDetail: SummaryDetailSchema,
  defaultKeyStatistics: DefaultKeyStatisticsSchema,
  financialData: FinancialDataSchema,
  earningsHistory: EarningsHistorySchema,
  earningsTrend: EarningsTrendSchema,
  recommendationTrend: RecommendationTrendSchema,
  assetProfile: AssetProfileSchema,
  calendarEvents: CalendarEventsSchema,
} as const;

/* ---------------------------------------------- fundamentalsTimeSeries() */

export const TimeSeriesRowSchema = z.object({
  date: isoDate,
  periodType: str,
  totalRevenue: num,
  operatingIncome: num,
  netIncome: num,
  freeCashFlow: num,
  operatingCashFlow: num,
  dilutedEPS: num,
});
export type TimeSeriesRow = z.output<typeof TimeSeriesRowSchema>;
export const TimeSeriesSchema = lenientArray(TimeSeriesRowSchema);

/* ------------------------------------------------------------------ chart() */

const TradingWindow = z
  .object({ start: isoDate, end: isoDate })
  .optional()
  .catch(undefined);

export const ChartMetaSchema = z.object({
  symbol: str,
  currency: str,
  exchangeTimezoneName: str,
  gmtoffset: num,
  chartPreviousClose: num,
  previousClose: num,
  regularMarketTime: isoDate,
  instrumentType: str,
  currentTradingPeriod: z
    .object({
      pre: TradingWindow,
      regular: TradingWindow,
      post: TradingWindow,
    })
    .optional()
    .catch(undefined),
});

/** Chart rows are parsed one by one so a bad row is dropped, not fatal. */
export const ChartRowSchema = z.object({
  date: isoDate,
  open: num,
  high: num,
  low: num,
  close: num,
  volume: num,
});
export const ChartResultSchema = z.object({
  meta: ChartMetaSchema,
  quotes: lenientArray(ChartRowSchema),
});
export type YahooChart = z.output<typeof ChartResultSchema>;

/* ------------------------------------------------------------------ search() */

const SearchQuote = z.object({
  symbol: str,
  shortname: str,
  longname: str,
  exchange: str,
  exchDisp: str,
  quoteType: str,
  sector: str,
  industry: str,
  isYahooFinance: bool,
});
export const SearchResultSchema = z.object({
  quotes: lenientArray(SearchQuote),
});

/* ------------------------------------------------- our own input validation */

/**
 * Tickers: letters, digits and the few symbols Yahoo uses (`.` exchange suffix, `-` share class
 * or crypto pair, `^` index, `=` FX/futures). 1-20 chars. Uppercased.
 */
export const SymbolSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9^=.\-]+$/, "invalid ticker characters")
  .transform((s) => s.toUpperCase());

export const RangeSchema = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.enum(["1H", "1D", "1W", "1M", "1Y", "3Y", "5Y", "ALL"]));

export const SearchQuerySchema = z
  .string()
  .transform((s) =>
    // strip control chars, collapse whitespace
    s
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  )
  .pipe(z.string().min(1).max(60));

/** Most symbols one /api/quotes call may carry (after de-duplication). */
export const MAX_QUOTE_SYMBOLS = 25;

export interface QuotesParamItem {
  /** Upper-cased ticker (valid) or the cleaned, truncated text (invalid). */
  symbol: string;
  valid: boolean;
}

/**
 * `?symbols=AAPL,mc.pa,7203.T`: comma-separated, trimmed, upper-cased, de-duplicated, order
 * preserved. The LIST must be sane (1-25 items, < 800 chars) or the whole call is a 400; a single
 * bad ticker is flagged `valid: false` and reported inline, so one stale entry in someone's
 * saved watchlist never blanks the whole dashboard. Invalid tickers are never sent upstream.
 */
export const QuotesParamSchema = z
  .string()
  .max(800, "symbols is too long")
  .transform((raw, ctx): QuotesParamItem[] => {
    const seen = new Set<string>();
    const items: QuotesParamItem[] = [];
    for (const part of raw.split(",")) {
      const t = part.trim();
      if (!t) continue;
      const parsed = SymbolSchema.safeParse(t);
      const item: QuotesParamItem = parsed.success
        ? { symbol: parsed.data, valid: true }
        : {
            symbol: t
              .replace(/[^\x20-\x7e]/g, "?")
              .slice(0, 20)
              .toUpperCase(),
            valid: false,
          };
      if (seen.has(item.symbol)) continue;
      seen.add(item.symbol);
      items.push(item);
    }
    if (items.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "at least one symbol is required",
      });
      return z.NEVER;
    }
    if (items.length > MAX_QUOTE_SYMBOLS) {
      ctx.addIssue({
        code: "custom",
        message: `at most ${MAX_QUOTE_SYMBOLS} symbols`,
      });
      return z.NEVER;
    }
    return items;
  });
