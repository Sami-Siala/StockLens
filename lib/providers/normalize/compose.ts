import "server-only";
import type {
  AnalystView,
  Earnings,
  FinancialPeriod,
  Fundamentals,
  KeyStats,
  CompanyProfile,
  Metric,
  Money,
  NextEarnings,
  PriceTarget,
  StockSnapshot,
} from "@/lib/contract";
import type { CoreBundle, DetailBundle, SectionName } from "../types";
import { scaleValue } from "../units";
import { miss, ok } from "./helpers";

export type ComposedStock = Omit<StockSnapshot, "meta"> & {
  degraded: SectionName[];
};

const DAY = 864e5;
/** Analyst target must sit within 0.2x-5x of the price, else we assume a unit/currency mix-up. */
const TARGET_MIN = 0.2;
const TARGET_MAX = 5;
/** How close a candidate must be to the value implied by price / P/E to be accepted. */
const TOLERANCE = 0.35;

const within = (value: number, expected: number, tol = TOLERANCE) =>
  expected !== 0 && Math.abs(value - expected) / Math.abs(expected) <= tol;

/**
 * Pick the interpretation of a raw per-share number that matches what we expect.
 * With a sub-unit price (pence) Yahoo is inconsistent about the unit of derived values,
 * so try "quoted unit" (scaled) and "already major"; accept the one that fits.
 */
function pickUnit(
  raw: number,
  scale: number,
  expected: number | null,
): number | null {
  if (scale === 1) return raw;
  if (expected === null) return null; // cannot verify which unit: do not guess
  const candidates = [scaleValue(raw, scale), raw];
  return candidates.find((c) => within(c, expected)) ?? null;
}

/** Sum of the last 4 quarterly diluted EPS, or the last annual EPS, in the statement currency. */
function trailingStatementEps(
  quarterly: FinancialPeriod[],
  annual: FinancialPeriod[],
): number | null {
  const q = quarterly
    .slice(-4)
    .map((p) => p.dilutedEps.value)
    .filter((x): x is number => x !== null);
  if (q.length === 4) return q.reduce((a, b) => a + b, 0);
  const a = annual.at(-1)?.dilutedEps.value;
  return a ?? null;
}

export function resolveNextEarnings(
  candidates: Array<{ date: string; isEstimate: boolean }>,
  now: Date,
): Metric<NextEarnings> {
  const t = now.getTime();
  // Yahoo keeps serving the LAST report date until the next one is scheduled; anything older
  // than 2 days is not "upcoming". Prefer the earliest future date, else a very recent one.
  const live = candidates
    .map((c) => ({ ...c, ms: Date.parse(c.date) }))
    .filter((c) => Number.isFinite(c.ms) && c.ms >= t - 2 * DAY)
    .sort((a, b) => a.ms - b.ms);
  const pick = live.find((c) => c.ms >= t) ?? live.at(-1);
  return pick
    ? ok({ date: pick.date, isEstimate: pick.isEstimate })
    : miss("not_provided_by_source");
}

function resolvePriceTarget(
  core: CoreBundle,
  detail: DetailBundle,
): Metric<PriceTarget> {
  const t = detail.analysts.target;
  if (!t) return miss("not_provided_by_source");
  const price = core.raw.priceQuoted;
  if (price === null || price <= 0) return miss("currency_mismatch");
  const plausible = (mean: number, ref: number) =>
    mean / ref >= TARGET_MIN && mean / ref <= TARGET_MAX;
  let scale: number;
  if (plausible(t.mean, price))
    scale = core.raw.scale; // same (quoted) unit as the price
  else if (core.raw.scale !== 1 && plausible(t.mean, price * core.raw.scale))
    scale = 1; // already in the major unit
  else return miss("currency_mismatch");
  const s = (v: number) => scaleValue(v, scale);
  return ok({
    low: s(t.low),
    mean: s(t.mean),
    median: t.median === null ? null : s(t.median),
    high: s(t.high),
    analysts: t.analysts,
    // The target is quoted against the same listing as the price, so it shares ITS currency.
    // (financialData.financialCurrency is the statement currency: TSM says TWD, target is USD.)
    currency: core.listing.priceCurrency,
  });
}

function buildKeyStats(core: CoreBundle, detail: DetailBundle): KeyStats {
  const { raw, listing } = core;
  const price =
    core.quote.value === null ? null : core.quote.value.price.amount;
  const priceCur = listing.priceCurrency;
  const finCur = detail.financialCurrency ?? listing.financialCurrency;
  const currenciesDiffer = finCur !== null && finCur !== priceCur;

  // Is Yahoo's EPS expressed in the STATEMENT currency (e.g. Shell: USD EPS, GBP price)?
  // Compare it to the statements' own trailing EPS. If so, price / EPS mixes currencies.
  let epsInFinancialCurrency = false;
  let epsUnknown = false;
  if (currenciesDiffer && raw.epsTrailing !== null) {
    const ttm = trailingStatementEps(detail.quarterly, detail.annual);
    if (ttm === null) epsUnknown = true;
    else epsInFinancialCurrency = within(raw.epsTrailing, ttm);
  }

  const none = (reason: "not_provided_by_source" | "currency_mismatch") =>
    miss<Money>(reason);

  const eps = (value: number | null, pe: number | null): Metric<Money> => {
    if (value === null) return none("not_provided_by_source");
    if (epsUnknown) return none("currency_mismatch");
    if (epsInFinancialCurrency && finCur)
      return ok({ amount: value, currency: finCur });
    const expected =
      pe !== null && pe > 0 && price !== null ? price / pe : null;
    const amount = pickUnit(value, raw.scale, expected);
    return amount === null
      ? none("currency_mismatch")
      : ok({ amount, currency: priceCur });
  };

  const pe = (
    value: number | null,
    epsValue: number | null,
  ): Metric<number> => {
    if ((epsValue !== null && epsValue <= 0) || (value !== null && value <= 0))
      return miss("negative_earnings");
    if (value === null) return miss("not_provided_by_source");
    if (epsInFinancialCurrency || epsUnknown) return miss("currency_mismatch");
    return ok(value);
  };

  // Market cap: Yahoo gives it in the (major) price currency; with pence, verify against shares.
  let marketCap: Metric<Money> = miss("not_provided_by_source");
  if (raw.marketCap !== null) {
    const shares = raw.sharesOutstanding;
    const expected = shares !== null && price !== null ? shares * price : null;
    const cap =
      raw.scale !== 1 && expected !== null
        ? ([raw.marketCap, scaleValue(raw.marketCap, raw.scale)].find((c) =>
            within(c, expected, 0.5),
          ) ?? raw.marketCap)
        : raw.marketCap;
    marketCap = ok({ amount: cap, currency: priceCur });
  }

  const yieldFraction =
    detail.stats.dividendYield.value ?? raw.dividendYield ?? null;
  const dividendYield: Metric<number> =
    yieldFraction !== null ? ok(yieldFraction) : detail.stats.dividendYield;

  const rateRaw = detail.stats.dividendRate.value ?? raw.dividendRate;
  let dividendRate: Metric<Money> = miss(
    detail.stats.dividendRate.reason ?? "not_reported",
  );
  if (rateRaw !== null && rateRaw !== undefined) {
    const expected =
      yieldFraction !== null && price !== null ? yieldFraction * price : null;
    const amount = pickUnit(rateRaw, raw.scale, expected);
    dividendRate =
      amount === null
        ? miss("currency_mismatch")
        : ok({ amount, currency: priceCur });
  }

  const shares = detail.stats.sharesOutstanding.value ?? raw.sharesOutstanding;
  return {
    marketCap,
    sharesOutstanding:
      shares !== null && shares !== undefined
        ? ok(shares)
        : miss(
            detail.stats.sharesOutstanding.reason ?? "not_provided_by_source",
          ),
    trailingPE: pe(raw.trailingPE, raw.epsTrailing),
    forwardPE: pe(raw.forwardPE, raw.epsForward),
    trailingEps: eps(raw.epsTrailing, raw.trailingPE),
    forwardEps: eps(raw.epsForward, raw.forwardPE),
    dividendYield,
    dividendRate,
    payoutRatio: detail.stats.payoutRatio,
    operatingMargin: detail.stats.operatingMargin,
    revenueGrowth: detail.stats.revenueGrowth,
    beta: detail.stats.beta,
  };
}

/**
 * Merge the fast bundle (quote) and the slow bundle (statements, earnings, analysts) into the
 * contract's StockSnapshot, applying everything that needs BOTH: type branching, the target
 * plausibility guard against the live price, EPS/P/E currency reconciliation, and dropping
 * stale "next earnings" dates (done here, at read time, because the slow bundle lives 12 h).
 */
export function composeStock(
  core: CoreBundle,
  detail: DetailBundle | null,
  now: Date,
): ComposedStock {
  const isEquity = core.listing.quoteType === "EQUITY";
  const degraded = new Set<SectionName>(detail?.degraded ?? []);
  if (core.quote.reason === "provider_error") degraded.add("quote");

  if (!isEquity) {
    // ETFs, indices, crypto have no fundamentals: failing to fetch them is not a degradation.
    for (const sec of ["fundamentals", "earnings", "analysts"] as const)
      degraded.delete(sec);
  }

  const na = <T>(): Metric<T> => miss("not_applicable_for_type");
  const failed = <T>(section: SectionName): Metric<T> => {
    degraded.add(section);
    return miss("provider_error");
  };

  let fundamentals: Metric<Fundamentals>;
  let earnings: Metric<Earnings>;
  let analysts: Metric<AnalystView>;

  if (!isEquity) {
    fundamentals = na();
    earnings = na();
    analysts = na();
  } else if (detail === null) {
    fundamentals = failed("fundamentals");
    earnings = failed("earnings");
    analysts = failed("analysts");
  } else {
    const quarterlyHasRevenue = detail.quarterly
      .slice(-2)
      .some((p) => p.revenue.value !== null);
    fundamentals = ok({
      financialCurrency:
        detail.financialCurrency ?? core.listing.financialCurrency,
      keyStats: buildKeyStats(core, detail),
      quarterly: detail.quarterly,
      annual: detail.annual,
      primaryView: quarterlyHasRevenue ? "quarterly" : "annual",
    });

    if (detail.earnings.status.value === null) {
      earnings = miss(detail.earnings.status.reason);
    } else {
      const history = detail.earnings.history;
      earnings = ok({
        lastQuarter: history.length
          ? ok(history[history.length - 1])
          : miss("not_provided_by_source"),
        history,
        next: resolveNextEarnings(
          [
            ...(detail.earnings.calendarDate
              ? [detail.earnings.calendarDate]
              : []),
            ...core.raw.earningsDates,
          ],
          now,
        ),
        epsEstimates: detail.earnings.epsEstimates,
        revenueEstimates: detail.earnings.revenueEstimates,
      });
    }

    if (detail.analysts.status.value === null) {
      analysts = miss(detail.analysts.status.reason);
    } else {
      analysts = ok({
        ratings: detail.analysts.ratings,
        ratingMean: detail.analysts.ratingMean,
        priceTarget: resolvePriceTarget(core, detail),
      });
    }
  }

  const profile: Metric<CompanyProfile> =
    detail === null ? failed("profile") : detail.profile;

  return {
    listing: core.listing,
    quote: core.quote,
    profile,
    fundamentals,
    earnings,
    analysts,
    degraded: [...degraded],
  };
}
