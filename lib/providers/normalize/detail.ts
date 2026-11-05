import "server-only";
import type {
  CompanyProfile,
  EarningsSurprise,
  Estimate,
  FinancialPeriod,
  Metric,
  PeriodLength,
  UnavailableReason,
} from "@/lib/contract";
import {
  SUMMARY_SCHEMAS,
  TimeSeriesSchema,
  type SummaryModule,
  type TimeSeriesRow,
} from "../schemas";
import type { DetailBundle, RawPriceTarget, SectionName } from "../types";
import { resolveCurrency, scaleValue } from "../units";
import { day, metric, miss, nn, ok, round } from "./helpers";

export interface RawDetail {
  /** quoteSummary result keyed by module; null when the call failed. */
  summary: Record<string, unknown> | null;
  /** fundamentalsTimeSeries rows; null when the call failed. */
  quarterly: unknown | null;
  annual: unknown | null;
}

type Parsed<M extends SummaryModule> =
  | { state: "ok"; data: ReturnType<(typeof SUMMARY_SCHEMAS)[M]["parse"]> }
  | { state: "absent" }
  | { state: "invalid" };

/** A module value that is `{error: ...}` (how our recorder stores failed modules) counts as absent. */
function parseModule<M extends SummaryModule>(
  summary: Record<string, unknown>,
  name: M,
): Parsed<M> {
  const v = summary[name];
  if (v === undefined || v === null) return { state: "absent" };
  if (typeof v === "object" && "error" in (v as object))
    return { state: "absent" };
  const r = SUMMARY_SCHEMAS[name].safeParse(v);
  return r.success
    ? { state: "ok", data: r.data as never }
    : { state: "invalid" };
}

const PERIODS: Record<string, PeriodLength> = {
  "3M": "3M",
  "6M": "6M",
  "12M": "12M",
};

/** Rows -> FinancialPeriod[] (oldest first, unique dates, only 3M/6M/12M rows). */
export function normalizeStatements(
  rows: TimeSeriesRow[],
  scale: number,
  keep: number,
): FinancialPeriod[] {
  const byDate = new Map<string, FinancialPeriod>();
  for (const r of rows) {
    const length = r.periodType ? PERIODS[r.periodType] : undefined;
    if (!r.date || !length) continue;
    const hollow = [
      r.totalRevenue,
      r.operatingIncome,
      r.netIncome,
      r.freeCashFlow,
    ].every((x) => x === undefined);
    // A row with NO income/cash-flow lines at all is a balance-sheet-only row: that is how a
    // semi-annual reporter (LVMH) looks in the "quarterly" series.
    const why: UnavailableReason =
      hollow && length !== "12M" ? "reported_less_often" : "not_reported";
    const line = (x: number | undefined): Metric<number> =>
      metric(x === undefined ? undefined : scaleValue(x, scale), why);
    byDate.set(day(r.date), {
      periodEnd: day(r.date),
      length,
      revenue: line(r.totalRevenue),
      operatingIncome: line(r.operatingIncome),
      netIncome: line(r.netIncome),
      freeCashFlow: line(r.freeCashFlow),
      operatingCashFlow: line(r.operatingCashFlow),
      dilutedEps: line(r.dilutedEPS),
    });
  }
  return [...byDate.values()]
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd))
    .slice(-keep);
}

const ESTIMATE_PERIODS = new Set(["0q", "+1q", "0y", "+1y"]);

/** quoteSummary + time series -> the slow-changing half of a stock page. */
export function normalizeDetail(raw: RawDetail, now: Date): DetailBundle {
  const degraded = new Set<SectionName>();
  const summaryFailed = raw.summary === null;
  const summary = raw.summary ?? {};
  const failReason: UnavailableReason = summaryFailed
    ? "provider_error"
    : "not_provided_by_source";

  const quoteTypeM = parseModule(summary, "quoteType");
  const detail = parseModule(summary, "summaryDetail");
  const keyStats = parseModule(summary, "defaultKeyStatistics");
  const fin = parseModule(summary, "financialData");
  const eh = parseModule(summary, "earningsHistory");
  const et = parseModule(summary, "earningsTrend");
  const rt = parseModule(summary, "recommendationTrend");
  const ap = parseModule(summary, "assetProfile");
  const cal = parseModule(summary, "calendarEvents");

  if (summaryFailed) {
    for (const s of [
      "profile",
      "earnings",
      "analysts",
      "fundamentals",
    ] as const)
      degraded.add(s);
  }
  const bad = (m: { state: string }, section: SectionName) => {
    if (m.state === "invalid") degraded.add(section);
  };
  bad(detail, "fundamentals");
  bad(keyStats, "fundamentals");
  bad(fin, "fundamentals");
  bad(fin, "analysts");
  bad(eh, "earnings");
  bad(et, "earnings");
  bad(cal, "earnings");
  bad(rt, "analysts");
  bad(ap, "profile");

  /** Reason for a missing value: invalid module = provider_error, else the supplied one. */
  const why = (
    m: { state: string },
    otherwise: UnavailableReason,
  ): UnavailableReason =>
    m.state === "invalid" || summaryFailed ? "provider_error" : otherwise;

  // ---- profile
  let profile: Metric<CompanyProfile>;
  if (ap.state === "ok") {
    const a = ap.data;
    const p: CompanyProfile = {
      sector: a.sector ?? null,
      industry: a.industry ?? null,
      country: a.country ?? null,
      website: a.website ?? null,
      employees: nn(a.fullTimeEmployees),
      summary: a.longBusinessSummary ?? null,
    };
    profile = Object.values(p).some((x) => x !== null)
      ? ok(p)
      : miss("not_provided_by_source");
  } else {
    profile = miss(why(ap, failReason));
  }

  // ---- financial currency (statement currency, resolved to a major unit)
  const finCurrency =
    fin.state === "ok" && fin.data.financialCurrency
      ? resolveCurrency(fin.data.financialCurrency)
      : null;
  const stmtScale = finCurrency?.scale ?? 1;

  // ---- statements
  const q = TimeSeriesSchema.safeParse(raw.quarterly);
  const a = TimeSeriesSchema.safeParse(raw.annual);
  const statementsOk =
    raw.quarterly !== null && raw.annual !== null && q.success && a.success;
  if (!statementsOk) degraded.add("fundamentals");
  const quarterly = q.success ? normalizeStatements(q.data, stmtScale, 8) : [];
  const annual = a.success ? normalizeStatements(a.data, stmtScale, 4) : [];

  // ---- key stats that do not depend on the live price
  const sdv = detail.state === "ok" ? detail.data : undefined;
  const ksv = keyStats.state === "ok" ? keyStats.data : undefined;
  const fdv = fin.state === "ok" ? fin.data : undefined;
  const stats: DetailBundle["stats"] = {
    dividendYield: metric(sdv?.dividendYield, why(detail, "not_reported")),
    dividendRate: metric(sdv?.dividendRate, why(detail, "not_reported")),
    payoutRatio: metric(sdv?.payoutRatio, why(detail, "not_reported")),
    operatingMargin: metric(fdv?.operatingMargins, why(fin, "not_reported")),
    revenueGrowth: metric(
      fdv?.revenueGrowth,
      why(fin, "not_provided_by_source"),
    ),
    beta: metric(sdv?.beta ?? ksv?.beta, why(detail, "not_provided_by_source")),
    sharesOutstanding: metric(
      ksv?.sharesOutstanding,
      why(keyStats, "not_provided_by_source"),
    ),
  };

  // ---- earnings
  const history: EarningsSurprise[] = [];
  if (eh.state === "ok") {
    for (const h of eh.data.history) {
      if (
        h.epsActual === undefined ||
        h.epsEstimate === undefined ||
        !h.quarter ||
        !h.currency
      )
        continue;
      const c = resolveCurrency(h.currency);
      const actual = scaleValue(h.epsActual, c.scale);
      const estimate = scaleValue(h.epsEstimate, c.scale);
      const difference = round(actual - estimate);
      history.push({
        quarterEnd: day(h.quarter),
        epsActual: actual,
        epsEstimate: estimate,
        difference,
        // Computed (not Yahoo's rounded field): fraction of |estimate|, negative = miss.
        surprise:
          estimate !== 0
            ? round(difference / Math.abs(estimate))
            : (nn(h.surprisePercent) ?? 0),
        currency: c.currency,
      });
    }
    history.sort((x, y) => x.quarterEnd.localeCompare(y.quarterEnd));
  }
  const epsEstimates: Estimate[] = [];
  const revenueEstimates: Estimate[] = [];
  if (et.state === "ok") {
    for (const t of et.data.trend) {
      if (!t.period || !ESTIMATE_PERIODS.has(t.period) || !t.endDate) continue;
      const period = t.period as Estimate["period"];
      for (const kind of ["eps", "revenue"] as const) {
        const b = kind === "eps" ? t.earningsEstimate : t.revenueEstimate;
        const code = kind === "eps" ? b?.earningsCurrency : b?.revenueCurrency;
        if (!b || b.avg === undefined || !code) continue;
        const c = resolveCurrency(code);
        const s = (v: number | undefined) =>
          v === undefined ? null : scaleValue(v, c.scale);
        (kind === "eps" ? epsEstimates : revenueEstimates).push({
          period,
          endDate: day(t.endDate),
          avg: scaleValue(b.avg, c.scale),
          low: s(b.low),
          high: s(b.high),
          analysts: nn(b.numberOfAnalysts),
          yearAgo: s(kind === "eps" ? b.yearAgoEps : b.yearAgoRevenue),
          growth: nn(b.growth),
          currency: c.currency,
        });
      }
    }
  }
  const calEarn = cal.state === "ok" ? cal.data.earnings : undefined;
  const calDate = calEarn?.earningsDate?.[0];
  const earningsStatus: Metric<true> = [eh, et, cal].some(
    (m) => m.state === "ok",
  )
    ? ok(true)
    : miss(
        [eh, et, cal].some((m) => m.state === "invalid") || summaryFailed
          ? "provider_error"
          : "not_provided_by_source",
      );

  // ---- analysts
  const trend = rt.state === "ok" ? rt.data.trend : [];
  const cur = trend.find((x) => x.period === "0m") ?? trend[0];
  const counts = cur
    ? [cur.strongBuy, cur.buy, cur.hold, cur.sell, cur.strongSell]
    : [];
  const ratings: DetailBundle["analysts"]["ratings"] =
    cur &&
    counts.every((n) => n !== undefined) &&
    counts.some((n) => (n ?? 0) > 0)
      ? ok({
          strongBuy: cur.strongBuy as number,
          buy: cur.buy as number,
          hold: cur.hold as number,
          sell: cur.sell as number,
          strongSell: cur.strongSell as number,
        })
      : miss(why(rt, "not_provided_by_source"));
  let target: RawPriceTarget | null = null;
  if (
    fdv &&
    fdv.targetLowPrice !== undefined &&
    fdv.targetMeanPrice !== undefined &&
    fdv.targetHighPrice !== undefined
  ) {
    target = {
      low: fdv.targetLowPrice,
      mean: fdv.targetMeanPrice,
      median: nn(fdv.targetMedianPrice),
      high: fdv.targetHighPrice,
      analysts: nn(fdv.numberOfAnalystOpinions),
    };
  }
  const analystsStatus: Metric<true> = [rt, fin].some((m) => m.state === "ok")
    ? ok(true)
    : miss(
        [rt, fin].some((m) => m.state === "invalid") || summaryFailed
          ? "provider_error"
          : "not_provided_by_source",
      );

  return {
    fetchedAt: now.toISOString(),
    quoteType:
      quoteTypeM.state === "ok" ? (quoteTypeM.data.quoteType ?? null) : null,
    profile,
    financialCurrency: finCurrency?.currency ?? null,
    stats,
    quarterly,
    annual,
    statementsOk,
    earnings: {
      status: earningsStatus,
      history: history.slice(-4),
      epsEstimates,
      revenueEstimates,
      calendarDate: calDate
        ? {
            date: calDate,
            isEstimate: calEarn?.isEarningsDateEstimate ?? false,
          }
        : null,
    },
    analysts: {
      status: analystsStatus,
      ratings,
      ratingMean: metric(
        fdv?.recommendationMean,
        why(fin, "not_provided_by_source"),
      ),
      target,
    },
    degraded: [...degraded],
  };
}
