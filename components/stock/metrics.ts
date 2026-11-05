/**
 * Pure selectors: turn a StockSnapshot into the values the six key cards show.
 * Every selector returns either a value or an UnavailableReason, never a raw null/NaN.
 */
import type {
  Candle,
  FinancialPeriod,
  Fundamentals,
  Metric,
  Money,
  PeriodLength,
  StockSnapshot,
  UnavailableReason,
} from "@/lib/contract";
import { isNum } from "../format";

export type Pick<T> =
  { ok: true; value: T } | { ok: false; reason: UnavailableReason };

export const ok = <T>(value: T): Pick<T> => ({ ok: true, value });
export const unavailable = <T>(reason: UnavailableReason): Pick<T> => ({
  ok: false,
  reason,
});

/** Metric -> Pick, also treating non-finite numbers as "not provided". */
export function fromMetric<T>(m: Metric<T> | undefined | null): Pick<T> {
  if (!m) return unavailable("provider_error");
  if (m.value === null)
    return unavailable(m.reason ?? "not_provided_by_source");
  if (typeof m.value === "number" && !isNum(m.value))
    return unavailable("not_provided_by_source");
  return ok(m.value);
}

export type Line = "revenue" | "operatingIncome" | "freeCashFlow";

export interface LinePick {
  value: number;
  periodEnd: string;
  length: PeriodLength;
  currency: string;
}

/**
 * Newest reported figure for one income / cash-flow line, from quarterly OR annual rows
 * (semi-annual reporters like LVMH only have annual figures).
 */
export function pickLine(
  f: Fundamentals | null,
  line: Line,
  fallbackReason: UnavailableReason,
): Pick<LinePick> {
  if (!f) return unavailable(fallbackReason);
  const rows: FinancialPeriod[] = [...f.quarterly, ...f.annual];
  const withValue = rows
    .filter((p) => isNum(p[line].value))
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  const best = withValue[0];
  if (best) {
    // Money without a known currency is never shown.
    if (!f.financialCurrency) return unavailable("currency_mismatch");
    return ok({
      value: best[line].value as number,
      periodEnd: best.periodEnd,
      length: best.length,
      currency: f.financialCurrency,
    });
  }
  const newest = (list: FinancialPeriod[]) =>
    [...list].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0];
  const reason =
    newest(f.annual)?.[line].reason ??
    newest(f.quarterly)?.[line].reason ??
    "not_provided_by_source";
  return unavailable(reason);
}

export type EpsVerdict = "beat" | "miss" | "inline";

export function epsVerdict(difference: number, surprise: number): EpsVerdict {
  const rel = isNum(surprise) ? surprise : 0;
  if (Math.abs(rel) < 0.005 && Math.abs(difference) < 0.005) return "inline";
  return difference > 0 || (difference === 0 && rel > 0)
    ? "beat"
    : difference < 0
      ? "miss"
      : "inline";
}

export interface ChartSummary {
  first: number;
  last: number;
  change: number;
  changePercent: number | null;
  high: number;
  low: number;
}

export function summarizeCandles(candles: Candle[]): ChartSummary | null {
  const good = candles.filter((c) => isNum(c.c) && isNum(c.h) && isNum(c.l));
  if (good.length < 2) return null;
  const first = good[0].c;
  const last = good[good.length - 1].c;
  return {
    first,
    last,
    change: last - first,
    changePercent: first !== 0 ? (last - first) / first : null,
    high: Math.max(...good.map((c) => c.h)),
    low: Math.min(...good.map((c) => c.l)),
  };
}

export function selectors(s: StockSnapshot) {
  const fundamentals = fromMetric(s.fundamentals);
  const f = fundamentals.ok ? fundamentals.value : null;
  const fr: UnavailableReason = fundamentals.ok
    ? "not_provided_by_source"
    : fundamentals.reason;
  return {
    fundamentals,
    eps: (() => {
      const e = fromMetric(s.earnings);
      return e.ok ? fromMetric(e.value.lastQuarter) : e;
    })(),
    trailingPE: f ? fromMetric(f.keyStats.trailingPE) : unavailable<number>(fr),
    forwardPE: f ? fromMetric(f.keyStats.forwardPE) : unavailable<number>(fr),
    marketCap: f ? fromMetric(f.keyStats.marketCap) : unavailable<Money>(fr),
    revenue: pickLine(f, "revenue", fr),
    operatingIncome: pickLine(f, "operatingIncome", fr),
    freeCashFlow: pickLine(f, "freeCashFlow", fr),
    operatingMargin: f
      ? fromMetric(f.keyStats.operatingMargin)
      : unavailable<number>(fr),
    revenueGrowth: f
      ? fromMetric(f.keyStats.revenueGrowth)
      : unavailable<number>(fr),
    financialCurrency: f?.financialCurrency ?? null,
  };
}
