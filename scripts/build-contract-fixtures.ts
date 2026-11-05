/**
 * PROTOTYPE normaliser: raw Yahoo recordings -> contract v0 fixtures.
 *
 *   npx tsx scripts/build-contract-fixtures.ts
 *
 * Purpose: prove the contract can be filled from REAL payloads (the object literals below
 * are type-checked against lib/contract) and give the frontend recorded fixtures to build
 * against while Step 2 writes the real provider. Step 2 (data-engineer) replaces this logic
 * with lib/providers/yahoo + zod; this script then only needs to keep calling it.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AnalystView,
  Candle,
  ChartResponse,
  ChartSeries,
  CompanyProfile,
  Earnings,
  EarningsSurprise,
  Estimate,
  FinancialPeriod,
  Fundamentals,
  InstrumentType,
  Listing,
  MarketState,
  Metric,
  Money,
  Quote,
  ResponseMeta,
  SearchHit,
  SearchResponse,
  StockSnapshot,
  UnavailableReason,
} from "../lib/contract";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

const RAW = join(process.cwd(), "tests/fixtures/raw");
const OUT = join(process.cwd(), "tests/fixtures/contract");

const ok = <T>(value: T): Metric<T> => ({ value, reason: null });
const miss = <T>(reason: UnavailableReason): Metric<T> => ({
  value: null,
  reason,
});
const num = (x: unknown): number | null =>
  typeof x === "number" && Number.isFinite(x) ? x : null;
const isErr = (x: Raw) => !x || typeof x !== "object" || "error" in x;
const iso = (x: unknown): string | null =>
  typeof x === "string" && x ? x : null;
const day = (x: string) => x.slice(0, 10);

/** Present number or a reason chosen by the caller. */
function metric(x: unknown, fallback: UnavailableReason): Metric<number> {
  const n = num(x);
  return n === null ? miss(fallback) : ok(n);
}
function money(
  x: unknown,
  currency: string,
  fallback: UnavailableReason,
): Metric<Money> {
  const n = num(x);
  return n === null ? miss(fallback) : ok({ amount: n, currency });
}

const read = async (symbol: string, name: string): Promise<Raw> =>
  JSON.parse(await readFile(join(RAW, symbol, `${name}.json`), "utf8"));

function instrumentType(t: string | undefined): InstrumentType {
  const known = [
    "EQUITY",
    "ETF",
    "MUTUALFUND",
    "INDEX",
    "CRYPTOCURRENCY",
    "CURRENCY",
    "FUTURE",
  ];
  return known.includes(t ?? "") ? (t as InstrumentType) : "OTHER";
}

function marketState(s: string | undefined): MarketState {
  switch (s) {
    case "REGULAR":
      return "REGULAR";
    case "PRE":
      return "PRE";
    case "POST":
      return "POST";
    case "CLOSED":
    case "PREPRE":
    case "POSTPOST":
      return "CLOSED";
    default:
      return "UNKNOWN";
  }
}

function buildChart(
  symbol: string,
  raw: Raw,
  range: "1Y" | "1W",
  interval: "1d" | "15m",
  state: MarketState,
): ChartResponse {
  const seen = new Set<number>();
  const candles: Candle[] = [];
  for (const q of raw.quotes as Raw[]) {
    const t = Math.floor(new Date(q.date).getTime() / 1000);
    if (q.close == null || q.open == null || q.high == null || q.low == null)
      continue; // drop null rows
    if (seen.has(t)) continue;
    seen.add(t);
    candles.push({
      t,
      o: q.open,
      h: q.high,
      l: q.low,
      c: q.close,
      v: num(q.volume),
    });
  }
  candles.sort((a, b) => a.t - b.t);
  const series: ChartSeries = {
    symbol,
    range,
    interval,
    currency: raw.meta.currency,
    exchangeTimezone: raw.meta.exchangeTimezoneName,
    gmtOffsetSeconds: raw.meta.gmtoffset,
    candles,
    previousClose: num(raw.meta.chartPreviousClose),
    marketState: state,
    fallback: null,
  };
  return { meta: meta(), range, series: ok(series) };
}

const meta = (): ResponseMeta => ({
  contractVersion: "0.1.0",
  source: "fixture",
  fetchedAt: new Date().toISOString(),
  stale: false,
});

function surprise(h: Raw): EarningsSurprise | null {
  const a = num(h.epsActual),
    e = num(h.epsEstimate);
  if (a === null || e === null || !h.quarter) return null;
  return {
    quarterEnd: day(h.quarter),
    epsActual: a,
    epsEstimate: e,
    difference: num(h.epsDifference) ?? a - e,
    surprise: num(h.surprisePercent) ?? (e !== 0 ? (a - e) / Math.abs(e) : 0),
    currency: h.currency ?? "USD",
  };
}

function estimates(
  trend: Raw[],
  key: "earningsEstimate" | "revenueEstimate",
  curKey: string,
): Estimate[] {
  const out: Estimate[] = [];
  for (const t of trend) {
    const e = t[key];
    if (!e || num(e.avg) === null || !t.endDate) continue;
    out.push({
      period: t.period,
      endDate: day(t.endDate),
      avg: e.avg,
      low: num(e.low),
      high: num(e.high),
      analysts: num(e.numberOfAnalysts),
      yearAgo: num(e.yearAgoEps ?? e.yearAgoRevenue),
      growth: num(e.growth),
      currency: e[curKey] ?? "USD",
    });
  }
  return out;
}

function period(row: Raw, length: "3M" | "12M" | "6M"): FinancialPeriod {
  // A row with NO income/cash-flow lines at all is a balance-sheet-only row (semi-annual reporters).
  const hollow = [
    "totalRevenue",
    "operatingIncome",
    "netIncome",
    "freeCashFlow",
  ].every((k) => num(row[k]) === null);
  const why: UnavailableReason = hollow
    ? "reported_less_often"
    : "not_reported";
  return {
    periodEnd: day(row.date),
    length,
    revenue: metric(row.totalRevenue, why),
    operatingIncome: metric(row.operatingIncome, why),
    netIncome: metric(row.netIncome, why),
    freeCashFlow: metric(row.freeCashFlow, why),
    operatingCashFlow: metric(row.operatingCashFlow, why),
    dilutedEps: metric(row.dilutedEPS, why),
  };
}

async function buildSnapshot(symbol: string): Promise<StockSnapshot> {
  const q = await read(symbol, "quote");
  const s = await read(symbol, "quoteSummary");
  const fq = await read(symbol, "fundamentals-quarterly");
  const fa = await read(symbol, "fundamentals-annual");

  const type = instrumentType(q.quoteType);
  const isEquity = type === "EQUITY";
  const na: UnavailableReason = isEquity
    ? "not_provided_by_source"
    : "not_applicable_for_type";
  const priceCurrency: string = q.currency;
  const state = marketState(q.marketState);

  const listing: Listing = {
    symbol,
    name: q.longName ?? q.shortName ?? symbol,
    shortName: q.shortName ?? null,
    quoteType: type,
    exchange: q.fullExchangeName,
    exchangeCode: q.exchange,
    exchangeTimezone: q.exchangeTimezoneName,
    priceCurrency,
    financialCurrency: q.financialCurrency ?? null,
    firstTradeDate: iso(q.firstTradeDateMilliseconds),
  };

  const quote: Metric<Quote> =
    num(q.regularMarketPrice) === null
      ? miss("provider_error")
      : ok({
          price: { amount: q.regularMarketPrice, currency: priceCurrency },
          change: num(q.regularMarketChange),
          // quote.* percentages are already in percent units (-1.71 = -1.71 %) -> fraction.
          changePercent:
            num(q.regularMarketChangePercent) === null
              ? null
              : q.regularMarketChangePercent / 100,
          previousClose: num(q.regularMarketPreviousClose),
          open: num(q.regularMarketOpen),
          dayHigh: num(q.regularMarketDayHigh),
          dayLow: num(q.regularMarketDayLow),
          volume: num(q.regularMarketVolume),
          fiftyTwoWeekHigh: num(q.fiftyTwoWeekHigh),
          fiftyTwoWeekLow: num(q.fiftyTwoWeekLow),
          marketState: state,
          asOf: iso(q.regularMarketTime) ?? new Date().toISOString(),
          delayMinutes: num(q.exchangeDataDelayedBy),
        });

  const ap = s.assetProfile;
  const profile: Metric<CompanyProfile> = isErr(ap)
    ? miss("provider_error")
    : ok({
        sector: ap.sector ?? null,
        industry: ap.industry ?? null,
        country: ap.country ?? null,
        website: ap.website ?? null,
        employees: num(ap.fullTimeEmployees),
        summary: ap.longBusinessSummary ?? null,
      });

  const sd = isErr(s.summaryDetail) ? {} : s.summaryDetail;
  const fd = isErr(s.financialData) ? {} : s.financialData;

  const fundamentals: Metric<Fundamentals> = !isEquity
    ? miss("not_applicable_for_type")
    : ok({
        financialCurrency: listing.financialCurrency,
        keyStats: {
          marketCap: money(q.marketCap, priceCurrency, na),
          sharesOutstanding: metric(q.sharesOutstanding, na),
          trailingPE: metric(
            q.trailingPE,
            (num(q.epsTrailingTwelveMonths) ?? 1) <= 0
              ? "negative_earnings"
              : na,
          ),
          forwardPE: metric(q.forwardPE, na),
          trailingEps: money(q.epsTrailingTwelveMonths, priceCurrency, na),
          forwardEps: money(q.epsForward, priceCurrency, na),
          // summaryDetail.dividendYield is a fraction; quote.dividendYield is in percent.
          dividendYield:
            num(sd.dividendYield) !== null
              ? ok(sd.dividendYield)
              : num(q.dividendYield) !== null
                ? ok(q.dividendYield / 100)
                : miss("not_reported"),
          dividendRate: money(
            sd.dividendRate ?? q.dividendRate,
            priceCurrency,
            "not_reported",
          ),
          payoutRatio: metric(sd.payoutRatio, "not_reported"),
          operatingMargin: metric(fd.operatingMargins, na),
          revenueGrowth: metric(fd.revenueGrowth, na),
          beta: metric(sd.beta, na),
        },
        quarterly: Array.isArray(fq) ? fq.map((r: Raw) => period(r, "3M")) : [],
        annual: Array.isArray(fa) ? fa.map((r: Raw) => period(r, "12M")) : [],
      });

  const eh = s.earningsHistory?.history as Raw[] | undefined;
  const history = (eh ?? [])
    .map(surprise)
    .filter((x): x is EarningsSurprise => x !== null)
    .sort((a, b) => a.quarterEnd.localeCompare(b.quarterEnd));
  const trend: Raw[] = isErr(s.earningsTrend)
    ? []
    : (s.earningsTrend.trend ?? []);
  const cal = isErr(s.calendarEvents) ? null : s.calendarEvents.earnings;
  const candidate =
    iso(cal?.earningsDate?.[0]) ??
    iso(q.earningsTimestampStart) ??
    iso(q.earningsTimestamp);
  // Yahoo keeps serving the LAST report date until the next one is scheduled (LVMH showed a
  // date months in the past), so anything older than 2 days is treated as "no upcoming date".
  const nextDate =
    candidate && new Date(candidate).getTime() > Date.now() - 2 * 864e5
      ? candidate
      : null;

  const earnings: Metric<Earnings> = !isEquity
    ? miss("not_applicable_for_type")
    : ok({
        lastQuarter: history.length
          ? ok(history[history.length - 1])
          : miss("not_provided_by_source"),
        history,
        next: nextDate
          ? ok({
              date: nextDate,
              isEstimate: Boolean(
                cal?.isEarningsDateEstimate ?? q.isEarningsDateEstimate,
              ),
            })
          : miss("not_provided_by_source"),
        epsEstimates: estimates(trend, "earningsEstimate", "earningsCurrency"),
        revenueEstimates: estimates(
          trend,
          "revenueEstimate",
          "revenueCurrency",
        ),
      });

  const rt = s.recommendationTrend?.trend?.[0];
  const price = num(q.regularMarketPrice);
  const tMean = num(fd.targetMeanPrice);
  // Plausibility guard: an analyst target wildly off the price means a currency mismatch.
  const targetPlausible =
    tMean !== null &&
    price !== null &&
    tMean / price > 0.2 &&
    tMean / price < 5;
  const analysts: Metric<AnalystView> = !isEquity
    ? miss("not_applicable_for_type")
    : ok({
        ratings: rt
          ? ok({
              strongBuy: rt.strongBuy,
              buy: rt.buy,
              hold: rt.hold,
              sell: rt.sell,
              strongSell: rt.strongSell,
            })
          : miss("not_provided_by_source"),
        ratingMean: metric(fd.recommendationMean, "not_provided_by_source"),
        priceTarget:
          tMean === null ||
          num(fd.targetLowPrice) === null ||
          num(fd.targetHighPrice) === null
            ? miss("not_provided_by_source")
            : !targetPlausible
              ? miss("currency_mismatch")
              : ok({
                  low: fd.targetLowPrice,
                  mean: tMean,
                  median: num(fd.targetMedianPrice),
                  high: fd.targetHighPrice,
                  analysts: num(fd.numberOfAnalystOpinions),
                  currency: priceCurrency, // see PriceTarget docs: NOT financialData.financialCurrency
                }),
      });

  return {
    meta: meta(),
    listing,
    quote,
    profile,
    fundamentals,
    earnings,
    analysts,
  };
}

async function main() {
  const symbols = (await readdir(RAW, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => d.name);

  for (const symbol of symbols) {
    const dir = join(OUT, symbol);
    await mkdir(dir, { recursive: true });
    const snap = await buildSnapshot(symbol);
    const state: MarketState = snap.quote.value?.marketState ?? "UNKNOWN";
    await writeFile(
      join(dir, "stock.json"),
      JSON.stringify(snap, null, 2) + "\n",
    );
    await writeFile(
      join(dir, "chart-1Y.json"),
      JSON.stringify(
        buildChart(
          symbol,
          await read(symbol, "chart-1y-1d"),
          "1Y",
          "1d",
          state,
        ),
        null,
        2,
      ) + "\n",
    );
    await writeFile(
      join(dir, "chart-1W.json"),
      JSON.stringify(
        buildChart(
          symbol,
          await read(symbol, "chart-5d-15m"),
          "1W",
          "15m",
          state,
        ),
        null,
        2,
      ) + "\n",
    );
    console.log("built", symbol);
  }

  const dir = join(OUT, "_search");
  await mkdir(dir, { recursive: true });
  for (const name of ["lvmh", "apple"]) {
    const raw = await read("_search", name);
    const hits: SearchHit[] = (raw.quotes as Raw[])
      .filter((h) => h.symbol && (h.shortname || h.longname))
      .map((h) => ({
        symbol: h.symbol,
        name: h.longname ?? h.shortname,
        exchange: h.exchDisp ?? h.exchange,
        exchangeCode: h.exchange,
        quoteType: instrumentType(h.quoteType),
        sector: h.sector ?? null,
        industry: h.industry ?? null,
      }));
    const body: SearchResponse = { query: name, hits };
    await writeFile(
      join(dir, `${name}.json`),
      JSON.stringify(body, null, 2) + "\n",
    );
  }
  console.log("built search fixtures");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
