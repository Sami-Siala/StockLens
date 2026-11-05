/**
 * Formatting for dashboard rows and index cells. Pure functions, no React.
 * Rules (contract v0.3.0, `IndexKind`): indices, FX and yields have NO currency; a yield changes
 * in percentage points (never in percent); a future is priced in its currency.
 */
import type {
  CurrencyCode,
  IndexKind,
  NextEarnings,
  QuoteEntry,
  QuoteLite,
} from "@/lib/contract";
import { formatNumber, formatPercent, isNum } from "../format";

export type Direction = "up" | "down" | "flat";

export function directionOf(
  ...values: Array<number | null | undefined>
): Direction {
  const v = values.find(isNum);
  if (v === undefined || v === 0) return "flat";
  return v > 0 ? "up" : "down";
}

/** Fraction digits Intl uses for a currency (JPY 0, EUR 2). */
export function currencyDigits(currency: string, locale: string): number {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits as number;
  } catch {
    return 2;
  }
}

/** The two fields `priceParts` reads: a `QuoteLite` and a ticker item both fit. */
export type PriceInput = { price: number; priceCurrency: CurrencyCode | null };
/** The two fields `changeParts` reads. */
export type ChangeInput = {
  change: number | null;
  changePercent: number | null;
};

export interface PriceParts {
  /** The number, locale-formatted. */
  amount: string;
  /** "EUR", "%" or null (indices, FX). */
  unit: string | null;
}

/** The level / price of a quote. `kind` is set for market-strip items, absent for companies. */
export function priceParts(
  q: PriceInput,
  locale: string,
  kind?: IndexKind,
): PriceParts {
  if (kind === "index")
    return {
      amount: formatNumber(q.price, locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      unit: null,
    };
  if (kind === "fx")
    return {
      amount: formatNumber(q.price, locale, {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
      }),
      unit: null,
    };
  if (kind === "yield")
    return {
      amount: formatNumber(q.price, locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      unit: "%",
    };
  const currency = q.priceCurrency;
  const digits = currency ? currencyDigits(currency, locale) : 2;
  return {
    amount: formatNumber(q.price, locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }),
    unit: currency,
  };
}

export interface ChangeParts {
  direction: Direction;
  /** "+0.58 %" or "+0.06" (percentage points: the caller appends the unit label). */
  text: string;
  /** True for yields: `text` is in percentage points. */
  points: boolean;
}

/** Day change: percent for everything except yields (percentage points). `null` when unknown. */
export function changeParts(
  q: ChangeInput,
  locale: string,
  kind?: IndexKind,
): ChangeParts | null {
  if (kind === "yield") {
    if (!isNum(q.change)) return null;
    return {
      direction: directionOf(q.change),
      text: formatNumber(q.change, locale, {
        signDisplay: "exceptZero",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      points: true,
    };
  }
  if (!isNum(q.changePercent)) return null;
  return {
    direction: directionOf(q.changePercent),
    text: formatPercent(q.changePercent, locale, { signed: true, digits: 2 }),
    points: false,
  };
}

/** The last known sparkline, or null (missing, or too short to draw). */
export function sparklineOf(q: QuoteLite): number[] | null {
  const v = q.sparkline.value;
  if (!v || v.length < 2) return null;
  const clean = v.filter(isNum);
  return clean.length >= 2 ? clean : null;
}

/** Entry usable as a priced quote (status ok and a value). */
export function okQuote(entry: QuoteEntry | undefined): QuoteLite | null {
  return entry && entry.status === "ok" ? entry.quote.value : null;
}

/* ---------- earnings ---------- */

export type EarningsWhen =
  | { kind: "reportsToday" }
  | { kind: "reportedToday" }
  | { kind: "reportsOn"; days: number }
  | { kind: "reportedOn"; days: number };

const DAY = 86_400_000;
const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * Where a report date sits relative to `now`, by calendar day in the viewer's time zone.
 * "Today" never shows as a future date: before the report time it is "reports today", after it
 * "reported today". `days` is the whole-day distance (negative = past).
 */
export function earningsWhen(
  earnings: NextEarnings,
  now: Date,
): EarningsWhen | null {
  const date = new Date(earnings.date);
  if (Number.isNaN(date.getTime())) return null;
  const days = Math.round((startOfDay(date) - startOfDay(now)) / DAY);
  if (days === 0)
    return date.getTime() <= now.getTime()
      ? { kind: "reportedToday" }
      : { kind: "reportsToday" };
  return days > 0 ? { kind: "reportsOn", days } : { kind: "reportedOn", days };
}

export interface EarningsItem {
  symbol: string;
  name: string;
  exchange: string;
  earnings: NextEarnings;
  when: EarningsWhen;
}

export const EARNINGS_WINDOW_DAYS = 7;

/**
 * Tile 7: who reports within the next week (and anything reported in the last 2 days), soonest
 * first. When nothing falls in the window, `upcoming` holds the 3 next dates so the tile is not
 * empty. Companies without a date are dropped.
 */
export function selectEarnings(
  items: Array<{
    symbol: string;
    name: string;
    exchange: string;
    earnings: NextEarnings | null;
  }>,
  now: Date,
): { thisWeek: EarningsItem[]; upcoming: EarningsItem[] } {
  const dated: EarningsItem[] = [];
  for (const it of items) {
    if (!it.earnings) continue;
    const when = earningsWhen(it.earnings, now);
    if (!when) continue;
    dated.push({ ...it, earnings: it.earnings, when });
  }
  dated.sort((a, b) => a.earnings.date.localeCompare(b.earnings.date));
  const days = (e: EarningsItem) =>
    e.when.kind === "reportsOn" || e.when.kind === "reportedOn"
      ? e.when.days
      : 0;
  const thisWeek = dated.filter(
    (e) => days(e) >= -2 && days(e) <= EARNINGS_WINDOW_DAYS,
  );
  const upcoming = thisWeek.length
    ? []
    : dated.filter((e) => days(e) > EARNINGS_WINDOW_DAYS).slice(0, 3);
  return { thisWeek, upcoming };
}

/** Message key under `Dash.markets.index` for the known strip symbols. */
export const INDEX_KEYS: Record<string, string> = {
  "^GSPC": "sp500",
  "^IXIC": "nasdaq",
  "^FCHI": "cac40",
  "^STOXX50E": "stoxx50",
  "^N225": "nikkei",
  "EURUSD=X": "eurusd",
  "GC=F": "gold",
  "^TNX": "us10y",
};
