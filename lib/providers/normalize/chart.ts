import "server-only";
import type {
  Candle,
  ChartInterval,
  ChartRange,
  ChartSeries,
  MarketState,
} from "@/lib/contract";
import { ProviderError } from "../errors";
import { ChartResultSchema, type YahooChart } from "../schemas";
import { resolveCurrency, scaleValue } from "../units";
import { nn } from "./helpers";

const MIN = 60;
const DAY_MS = 864e5;

/**
 * How each UI range maps to a Yahoo request (PLAN §3.4). yahoo-finance2 v4's chart() has NO
 * `range` option, only period1/period2, so every range is a `lookbackMs` window ending now.
 * Windows that Yahoo cannot express exactly are fetched wide and cut by `window`:
 *   1H  = the last 60 min of 1m bars, ending at the LAST bar (so a closed market still shows
 *         its last trading hour, flagged via `fallback`/`marketClosed`)
 *   1D  = the last trading day of 5m bars
 *   1W  = the last 5 trading days of 15m bars
 * Intraday ranges exclude pre/post-market bars (zero-volume noise, odd gaps).
 */
export interface RangePlan {
  interval: ChartInterval;
  /** null = from the beginning of time (ALL). */
  lookbackMs: number | null;
  includePrePost: boolean;
  window: "last_60_min" | "last_1_day" | "last_5_days" | null;
}

export const RANGE_PLANS: Record<ChartRange, RangePlan> = {
  "1H": {
    interval: "1m",
    lookbackMs: 4 * DAY_MS,
    includePrePost: false,
    window: "last_60_min",
  },
  "1D": {
    interval: "5m",
    lookbackMs: 5 * DAY_MS,
    includePrePost: false,
    window: "last_1_day",
  },
  "1W": {
    interval: "15m",
    lookbackMs: 8 * DAY_MS,
    includePrePost: false,
    window: "last_5_days",
  },
  "1M": {
    interval: "1h",
    lookbackMs: 31 * DAY_MS,
    includePrePost: false,
    window: null,
  },
  "1Y": {
    interval: "1d",
    lookbackMs: 366 * DAY_MS,
    includePrePost: true,
    window: null,
  },
  "3Y": {
    interval: "1wk",
    lookbackMs: 3 * 366 * DAY_MS,
    includePrePost: true,
    window: null,
  },
  "5Y": {
    interval: "1wk",
    lookbackMs: 5 * 366 * DAY_MS,
    includePrePost: true,
    window: null,
  },
  ALL: {
    interval: "1mo",
    lookbackMs: null,
    includePrePost: true,
    window: null,
  },
};

/** period1 for a range. ALL uses 1970-01-02 (period1 = 0 is treated as "unset" by some code paths). */
export function periodStart(range: ChartRange, now: Date): Date {
  const { lookbackMs } = RANGE_PLANS[range];
  return lookbackMs === null
    ? new Date("1970-01-02T00:00:00Z")
    : new Date(now.getTime() - lookbackMs);
}

/** Local calendar day ("2026-11-05") of a unix-seconds timestamp in an IANA zone. */
function localDayFn(timeZone: string): (t: number) => string {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }
  return (t) => fmt.format(new Date(t * 1000));
}

/** Rows -> candles: null rows dropped, strictly ascending, unique timestamps (last write wins). */
export function toCandles(rows: YahooChart["quotes"], scale: number): Candle[] {
  const byT = new Map<number, Candle>();
  for (const r of rows) {
    if (
      !r.date ||
      r.open === undefined ||
      r.high === undefined ||
      r.low === undefined ||
      r.close === undefined
    )
      continue; // Yahoo pads gaps with all-null rows
    const t = Math.floor(Date.parse(r.date) / 1000);
    if (!Number.isFinite(t)) continue;
    byT.set(t, {
      t,
      o: scaleValue(r.open, scale),
      h: scaleValue(r.high, scale),
      l: scaleValue(r.low, scale),
      c: scaleValue(r.close, scale),
      v: nn(r.volume),
    });
  }
  return [...byT.values()].sort((a, b) => a.t - b.t);
}

function sessionState(meta: YahooChart["meta"], now: Date): MarketState {
  const p = meta.currentTradingPeriod;
  if (!p?.regular?.start || !p.regular.end) return "UNKNOWN";
  const t = now.getTime();
  const inside = (w?: { start?: string; end?: string }) =>
    !!w?.start && !!w.end && t >= Date.parse(w.start) && t < Date.parse(w.end);
  if (inside(p.regular)) return "REGULAR";
  if (inside(p.pre)) return "PRE";
  if (inside(p.post)) return "POST";
  return "CLOSED";
}

/**
 * Raw chart() result -> ChartSeries.
 * Close prices are split-adjusted but NOT dividend-adjusted (Yahoo `close`, not `adjclose`).
 */
export function normalizeChart(
  symbol: string,
  range: ChartRange,
  raw: unknown,
  now: Date,
): ChartSeries {
  const parsed = ChartResultSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.meta.currency) {
    throw new ProviderError(
      "invalid_payload",
      `Unusable chart payload for ${symbol}`,
    );
  }
  const { meta, quotes } = parsed.data;
  const plan = RANGE_PLANS[range];
  const cur = resolveCurrency(meta.currency as string);
  const timezone = meta.exchangeTimezoneName ?? "UTC";
  const all = toCandles(quotes, cur.scale);
  const state = sessionState(meta, now);
  const marketClosed =
    state === "CLOSED" || state === "PRE" || state === "POST";
  const dayOf = localDayFn(timezone);
  const toScaled = (v: number | undefined) =>
    v === undefined ? null : scaleValue(v, cur.scale);

  let candles = all;
  let fallback: ChartSeries["fallback"] = null;

  if (plan.window === "last_60_min" && all.length) {
    const end = all[all.length - 1].t;
    candles = all.filter((c) => c.t > end - 60 * MIN);
    // Not the live trailing hour (market closed, or before the open): say so.
    if (marketClosed) fallback = "last_trading_hour";
  } else if (plan.window === "last_1_day" && all.length) {
    const lastDay = dayOf(all[all.length - 1].t);
    candles = all.filter((c) => dayOf(c.t) === lastDay);
    if (lastDay !== dayOf(Math.floor(now.getTime() / 1000)))
      fallback = "last_trading_day";
  } else if (plan.window === "last_5_days" && all.length) {
    const days = [...new Set(all.map((c) => dayOf(c.t)))].slice(-5);
    const keep = new Set(days);
    candles = all.filter((c) => keep.has(dayOf(c.t)));
  }

  // Reference close for the change display.
  let previousClose: number | null;
  if (plan.window === "last_60_min" || plan.window === "last_1_day") {
    // Previous session's last bar if it is in the data we fetched, else Yahoo's own field.
    const firstDay = candles.length ? dayOf(candles[0].t) : null;
    const prev = firstDay
      ? [...all].reverse().find((c) => dayOf(c.t) < firstDay)
      : undefined;
    previousClose =
      prev?.c ?? toScaled(meta.previousClose ?? meta.chartPreviousClose);
  } else {
    previousClose = toScaled(meta.chartPreviousClose);
  }

  return {
    symbol,
    range,
    interval: plan.interval,
    currency: cur.currency,
    exchangeTimezone: timezone,
    gmtOffsetSeconds: nn(meta.gmtoffset) ?? 0,
    candles,
    previousClose,
    marketState: state,
    marketClosed,
    fallback,
  };
}
