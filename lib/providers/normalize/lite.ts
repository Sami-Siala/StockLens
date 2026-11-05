import "server-only";
import type {
  IndexKind,
  InstrumentType,
  MarketId,
  MarketIndexItem,
  MarketState,
  MarketStatus,
  Metric,
  NextEarnings,
  QuoteLite,
} from "@/lib/contract";
import { ChartResultSchema } from "../schemas";
import { ProviderError } from "../errors";
import type { CoreBundle } from "../types";
import { resolveCurrency } from "../units";
import { resolveNextEarnings } from "./compose";
import { miss, ok } from "./helpers";
import { toCandles } from "./chart";

const DAY_MS = 864e5;

/* -------------------------------------------------------------- sparkline */

/**
 * Sparkline = daily closes over the last 6 weeks (about 30 trading days): the cheapest honest
 * "shape of the last month" (one `1d` chart call per symbol, tiny payload, stable all day, so it
 * is cached 30 min while the price is cached 45 s). An intraday sparkline would be flat or
 * misleading before the open, after the close and across time zones.
 */
export const SPARKLINE_LOOKBACK_MS = 42 * DAY_MS;
export const SPARKLINE_MAX_POINTS = 30;

/**
 * Keep at most `max` points, evenly spaced by index, ALWAYS keeping the first and the last
 * (the shape's ends carry the meaning). Pure; returns the input untouched when short enough.
 */
export function thin<T>(values: T[], max = SPARKLINE_MAX_POINTS): T[] {
  if (max < 2 || values.length <= max) return values;
  const out: T[] = [];
  const last = values.length - 1;
  for (let i = 0; i < max; i++)
    out.push(values[Math.round((i * last) / (max - 1))]);
  return out;
}

/** chart() result -> thinned closes in the MAJOR currency unit (same unit as the price). */
export function normalizeSparkline(symbol: string, raw: unknown): number[] {
  const parsed = ChartResultSchema.safeParse(raw);
  if (!parsed.success)
    throw new ProviderError(
      "invalid_payload",
      `Unusable chart payload for ${symbol}`,
    );
  const scale = parsed.data.meta.currency
    ? resolveCurrency(parsed.data.meta.currency).scale
    : 1;
  const closes = toCandles(parsed.data.quotes, scale).map((c) => c.c);
  return thin(closes);
}

/* ---------------------------------------------------------------- QuoteLite */

export type QuoteLiteBase = Omit<QuoteLite, "sparkline">;

/** Types that never report earnings. */
const NO_EARNINGS: InstrumentType[] = [
  "ETF",
  "MUTUALFUND",
  "INDEX",
  "CRYPTOCURRENCY",
  "CURRENCY",
  "FUTURE",
];

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * CoreBundle (from the batched quote(), also used by the stock page) -> the tile-sized quote
 * without its sparkline. `quote.value === null` carries Yahoo's reason (no price).
 */
export function liteFromCore(
  core: CoreBundle,
  now: Date,
): Metric<QuoteLiteBase> {
  const q = core.quote.value;
  if (!q) return miss(core.quote.reason ?? "not_provided_by_source");
  const l = core.listing;
  const nextEarnings: Metric<NextEarnings> = NO_EARNINGS.includes(l.quoteType)
    ? miss("not_applicable_for_type")
    : resolveNextEarnings(core.raw.earningsDates, now);
  return ok({
    symbol: l.symbol,
    name: collapse(l.name),
    exchange: l.exchange,
    quoteType: l.quoteType,
    priceCurrency: q.price.currency,
    priceSubunit: l.priceSubunit ?? null,
    price: q.price.amount,
    change: q.change,
    changePercent: q.changePercent,
    marketState: q.marketState,
    delayMinutes: q.delayMinutes,
    asOf: q.asOf,
    nextEarnings,
  });
}

export function attachSparkline(
  base: QuoteLiteBase,
  sparkline: Metric<number[]>,
): QuoteLite {
  return { ...base, sparkline };
}

/** Sparkline outcome -> Metric: fewer than 2 points cannot draw a line. */
export function sparklineMetric(points: number[]): Metric<number[]> {
  return points.length >= 2 ? ok(points) : miss("not_provided_by_source");
}

/* ----------------------------------------------------------- market strip */

export interface StripSpec {
  symbol: string;
  label: string;
  kind: IndexKind;
}

/**
 * The index strip (PLAN §4.3), all verified against live Yahoo on 2026-11-05. `kind` tells the
 * UI how to format the number: see `IndexKind`.
 */
export const MARKET_STRIP: readonly StripSpec[] = [
  { symbol: "^GSPC", label: "S&P 500", kind: "index" },
  { symbol: "^IXIC", label: "Nasdaq Composite", kind: "index" },
  { symbol: "^FCHI", label: "CAC 40", kind: "index" },
  { symbol: "^STOXX50E", label: "Euro Stoxx 50", kind: "index" },
  { symbol: "^N225", label: "Nikkei 225", kind: "index" },
  { symbol: "EURUSD=X", label: "EUR/USD", kind: "fx" },
  { symbol: "GC=F", label: "Gold", kind: "future" },
  { symbol: "^TNX", label: "US 10-year yield", kind: "yield" },
];
export const MARKET_SYMBOLS = MARKET_STRIP.map((s) => s.symbol);

/** Strip a currency that would mislead (points, FX rates, yields are not money). */
export function stripItemQuote(
  kind: IndexKind,
  quote: Metric<QuoteLite>,
): Metric<QuoteLite> {
  if (quote.value === null || kind === "future") return quote;
  return ok({ ...quote.value, priceCurrency: null, priceSubunit: null });
}

export function indexItem(
  spec: StripSpec,
  quote: Metric<QuoteLite>,
  stale: boolean,
): MarketIndexItem {
  return {
    symbol: spec.symbol,
    label: spec.label,
    kind: spec.kind,
    quote: stripItemQuote(spec.kind, quote),
    stale,
  };
}

/* ------------------------------------------------------------ status chips */

interface MarketSpec {
  id: MarketId;
  label: string;
  timezone: string;
  /** Index whose Yahoo `marketState` decides the chip (it knows about holidays). */
  reference: string;
  /** Regular sessions as [open, close) in minutes after local midnight, Monday to Friday. */
  sessions: Array<[number, number]>;
}

export const MARKETS: readonly MarketSpec[] = [
  {
    id: "us",
    label: "NYSE / Nasdaq",
    timezone: "America/New_York",
    reference: "^GSPC",
    sessions: [[9 * 60 + 30, 16 * 60]],
  },
  {
    id: "paris",
    label: "Euronext Paris",
    timezone: "Europe/Paris",
    reference: "^FCHI",
    sessions: [[9 * 60, 17 * 60 + 30]],
  },
  {
    id: "tokyo",
    label: "Tokyo (TSE)",
    timezone: "Asia/Tokyo",
    reference: "^N225",
    // Morning session, lunch break, afternoon session (closing 15:30 since Nov 2024).
    sessions: [
      [9 * 60, 11 * 60 + 30],
      [12 * 60 + 30, 15 * 60 + 30],
    ],
  },
];

/** Weekday + regular hours in the exchange's own time zone. Knows nothing about holidays. */
export function scheduleState(
  timezone: string,
  sessions: Array<[number, number]>,
  now: Date,
): MarketState {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  if (get("weekday") === "Sat" || get("weekday") === "Sun") return "CLOSED";
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  return sessions.some(([a, b]) => minutes >= a && minutes < b)
    ? "REGULAR"
    : "CLOSED";
}

/**
 * Open/closed chips. Primary source: the reference index's Yahoo `marketState`. When that
 * quote is missing or only a stale copy (an old "REGULAR" would lie), fall back to the schedule
 * and say so via `basis: "schedule"`.
 */
export function buildStatus(
  refs: Map<string, { quote: Metric<QuoteLite>; stale: boolean }>,
  now: Date,
): MarketStatus[] {
  return MARKETS.map((m) => {
    const ref = refs.get(m.reference);
    const live = ref && !ref.stale && ref.quote.value ? ref.quote.value : null;
    const state: MarketState =
      live && live.marketState !== "UNKNOWN"
        ? live.marketState
        : scheduleState(m.timezone, m.sessions, now);
    const fromYahoo = !!live && live.marketState !== "UNKNOWN";
    return {
      id: m.id,
      label: m.label,
      exchangeTimezone: m.timezone,
      marketState: state,
      isOpen: state === "REGULAR",
      basis: fromYahoo ? "yahoo" : "schedule",
      referenceSymbol: fromYahoo ? m.reference : null,
    };
  });
}
