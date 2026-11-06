import type {
  AiLanguage,
  FinancialPeriod,
  Metric,
  StockSnapshot,
} from "@/lib/contract";
import {
  count,
  dateLabel,
  money,
  moneyCompact,
  percent,
  ratio,
} from "./format";

/**
 * The fact sheet: the ONLY numbers the model ever sees, each under a stable metric id. The model
 * writes `{{id}}` where it wants a number; the server swaps in `display` (integrity.ts). So the text
 * can never disagree with the page, and a made-up figure has nowhere to come from.
 */

export const FACT_IDS = [
  "price",
  "week52_high",
  "week52_low",
  "market_cap",
  "pe_trailing",
  "pe_forward",
  "eps_trailing",
  "eps_forward",
  "dividend_yield",
  "payout_ratio",
  "operating_margin",
  "revenue_growth",
  "beta",
  "revenue_latest",
  "operating_income_latest",
  "net_income_latest",
  "free_cash_flow_latest",
  "eps_last_actual",
  "eps_last_estimate",
  "eps_surprise",
  "next_earnings_date",
  "target_mean",
  "target_low",
  "target_high",
  "target_upside",
  "analyst_count",
  "rating_mean",
  "analysts_buy",
  "analysts_hold",
  "analysts_sell",
] as const;
export type FactId = (typeof FACT_IDS)[number];

export interface Fact {
  id: FactId;
  /** English description for the model (it translates when it writes French). */
  label: string;
  /** Final text, already formatted for the output language: "$3.2T", "34.2", "5.8%". */
  display: string;
}

export interface FactSheet {
  symbol: string;
  name: string;
  exchange: string;
  quoteType: string;
  sector: string | null;
  industry: string | null;
  country: string | null;
  /** Third-party text. Goes into the prompt as DATA only. */
  summary: string | null;
  facts: Partial<Record<FactId, Fact>>;
}

const val = <T>(m: Metric<T>): T | null => (m.reason === null ? m.value : null);

/** Facts about the quote alone say nothing about the business. */
const QUOTE_ONLY: ReadonlySet<FactId> = new Set([
  "price",
  "week52_high",
  "week52_low",
]);

/** The latest period of the series the page charts by default that actually carries revenue. */
function latestPeriod(stock: StockSnapshot): {
  period: FinancialPeriod;
  currency: string;
} | null {
  const f = val(stock.fundamentals);
  const currency = f?.financialCurrency;
  if (!f || !currency) return null;
  const order =
    f.primaryView === "quarterly"
      ? ["quarterly", "annual"]
      : ["annual", "quarterly"];
  for (const key of order) {
    const rows = key === "quarterly" ? f.quarterly : f.annual;
    for (let i = rows.length - 1; i >= 0; i--)
      if (val(rows[i].revenue) !== null) return { period: rows[i], currency };
  }
  return null;
}

export function buildFacts(stock: StockSnapshot, lang: AiLanguage): FactSheet {
  const facts: FactSheet["facts"] = {};
  const add = (id: FactId, label: string, display: string | null) => {
    if (display !== null) facts[id] = { id, label, display };
  };
  const num = <T>(m: Metric<T>, f: (v: T) => string): string | null => {
    const v = val(m);
    return v === null ? null : f(v);
  };

  const quote = val(stock.quote);
  const cur = stock.listing.priceCurrency;
  if (quote) {
    add(
      "price",
      "Latest share price",
      money(quote.price.amount, quote.price.currency, lang),
    );
    if (quote.fiftyTwoWeekHigh !== null)
      add(
        "week52_high",
        "52-week high",
        money(quote.fiftyTwoWeekHigh, cur, lang),
      );
    if (quote.fiftyTwoWeekLow !== null)
      add("week52_low", "52-week low", money(quote.fiftyTwoWeekLow, cur, lang));
  }

  const fund = val(stock.fundamentals);
  if (fund) {
    const k = fund.keyStats;
    add(
      "market_cap",
      "Market capitalisation (share price x number of shares)",
      num(k.marketCap, (m) => moneyCompact(m.amount, m.currency, lang)),
    );
    add(
      "pe_trailing",
      "Trailing P/E ratio (price / earnings per share of the last twelve months)",
      num(k.trailingPE, (v) => ratio(v, lang)),
    );
    add(
      "pe_forward",
      "Forward P/E ratio (price / analysts' expected earnings per share)",
      num(k.forwardPE, (v) => ratio(v, lang)),
    );
    add(
      "eps_trailing",
      "Earnings per share, last twelve months",
      num(k.trailingEps, (m) => money(m.amount, m.currency, lang)),
    );
    add(
      "eps_forward",
      "Earnings per share expected by analysts",
      num(k.forwardEps, (m) => money(m.amount, m.currency, lang)),
    );
    add(
      "dividend_yield",
      "Dividend yield (yearly dividend / share price)",
      num(k.dividendYield, (v) => percent(v, lang, { digits: 2 })),
    );
    add(
      "payout_ratio",
      "Dividend payout ratio (share of profit paid out as dividends)",
      num(k.payoutRatio, (v) => percent(v, lang, { digits: 0 })),
    );
    add(
      "operating_margin",
      "Operating margin (operating profit / revenue)",
      num(k.operatingMargin, (v) => percent(v, lang)),
    );
    add(
      "revenue_growth",
      "Revenue growth, year over year",
      num(k.revenueGrowth, (v) => percent(v, lang, { signed: true })),
    );
    add(
      "beta",
      "Beta (how strongly the share moves with the market; 1 = same as the market)",
      num(k.beta, (v) => ratio(v, lang, 2)),
    );

    const latest = latestPeriod(stock);
    if (latest) {
      const { period, currency } = latest;
      const span =
        period.length === "12M"
          ? "fiscal year"
          : period.length === "6M"
            ? "half-year"
            : "quarter";
      const tag = `${span} ended ${period.periodEnd}`;
      const compact = (v: number) => moneyCompact(v, currency, lang);
      add("revenue_latest", `Revenue, ${tag}`, num(period.revenue, compact));
      add(
        "operating_income_latest",
        `Operating profit, ${tag}`,
        num(period.operatingIncome, compact),
      );
      add(
        "net_income_latest",
        `Net profit, ${tag}`,
        num(period.netIncome, compact),
      );
      add(
        "free_cash_flow_latest",
        `Free cash flow (cash in minus cash out), ${tag}`,
        num(period.freeCashFlow, compact),
      );
    }
  }

  const earn = val(stock.earnings);
  if (earn) {
    const last = val(earn.lastQuarter);
    if (last) {
      add(
        "eps_last_actual",
        `Earnings per share reported for the quarter ended ${last.quarterEnd}`,
        money(last.epsActual, last.currency, lang),
      );
      add(
        "eps_last_estimate",
        "Earnings per share analysts expected for that quarter",
        money(last.epsEstimate, last.currency, lang),
      );
      add(
        "eps_surprise",
        "Surprise: reported vs expected earnings per share (positive = beat)",
        percent(last.surprise, lang, { signed: true }),
      );
    }
    add(
      "next_earnings_date",
      "Next earnings report (date may be an estimate)",
      num(earn.next, (n) => dateLabel(n.date, lang)),
    );
  }

  const an = val(stock.analysts);
  if (an) {
    const t = val(an.priceTarget);
    if (t) {
      add(
        "target_mean",
        "Analysts' average price target",
        money(t.mean, t.currency, lang),
      );
      add(
        "target_low",
        "Analysts' lowest price target",
        money(t.low, t.currency, lang),
      );
      add(
        "target_high",
        "Analysts' highest price target",
        money(t.high, t.currency, lang),
      );
      if (t.analysts !== null)
        add(
          "analyst_count",
          "Number of analysts giving a price target",
          count(t.analysts, lang),
        );
      // Only when target and price are in the same currency; otherwise the comparison is meaningless.
      if (
        quote &&
        quote.price.currency === t.currency &&
        quote.price.amount > 0
      )
        add(
          "target_upside",
          "Gap between the average target and the share price (positive = target above price)",
          percent(t.mean / quote.price.amount - 1, lang, { signed: true }),
        );
    }
    add(
      "rating_mean",
      "Average analyst rating (1 = strong buy, 3 = hold, 5 = strong sell)",
      num(an.ratingMean, (v) => ratio(v, lang)),
    );
    const r = val(an.ratings);
    if (r) {
      add(
        "analysts_buy",
        "Analysts rating it buy or strong buy",
        count(r.strongBuy + r.buy, lang),
      );
      add("analysts_hold", "Analysts rating it hold", count(r.hold, lang));
      add(
        "analysts_sell",
        "Analysts rating it sell or strong sell",
        count(r.sell + r.strongSell, lang),
      );
    }
  }

  const profile = val(stock.profile);
  return {
    symbol: stock.listing.symbol,
    name: stock.listing.name,
    exchange: stock.listing.exchange,
    quoteType: stock.listing.quoteType,
    sector: profile?.sector ?? null,
    industry: profile?.industry ?? null,
    country: profile?.country ?? null,
    summary: profile?.summary ?? null,
    facts,
  };
}

/** How many facts say something about the business (not just the quote). Gate for "insufficient_data". */
export function substantiveFactCount(sheet: FactSheet): number {
  return Object.keys(sheet.facts).filter((id) => !QUOTE_ONLY.has(id as FactId))
    .length;
}

/** id -> display, the shape cached next to a generation and used by the renderer. */
export function displayMap(sheet: FactSheet): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of Object.values(sheet.facts)) if (f) out[f.id] = f.display;
  return out;
}
