/**
 * Records RAW Yahoo payloads (via yahoo-finance2) into tests/fixtures/raw/<SYMBOL>/.
 * These recordings are the source the data contract (lib/contract) is derived from,
 * and the input for the normalizer tests in Step 2. Run manually, never in CI:
 *
 *   npx tsx scripts/record-fixtures.ts                      # default symbol set
 *   npx tsx scripts/record-fixtures.ts AAPL SPY             # chosen symbols
 *   npx tsx scripts/record-fixtures.ts --charts AAPL 7203.T # ONLY the extra chart intervals
 *                                                           # (1m, 5m, 1h, 1wk, 1mo) for those symbols
 *
 * Calls are spaced out on purpose: Yahoo answers 429 to bursts.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import YahooFinance from "yahoo-finance2";

const DEFAULT_SYMBOLS = [
  "AAPL", // US large cap, the "complete" case
  "MC.PA", // Paris, EUR, semi-annual reporter, partial fields
  "7203.T", // Tokyo, JPY, forward P/E often missing
  "SPY", // ETF: no fundamentals (sparse case)
  "TSM", // ADR: trades in USD, reports in TWD (currency case)
  "JPM", // bank: no operating income / FCF lines (Step 2)
  "RIVN", // loss-maker: negative EPS, no trailing P/E (Step 2)
  "SHEL.L", // LSE: quoted in GBp (pence), reports in USD (Step 2)
];

/** Chart windows for the 8 UI ranges (PLAN §3.4); recorded with period1 because chart() has no `range`. */
const EXTRA_CHARTS = [
  { name: "chart-1m-1m", days: 4, interval: "1m", prepost: false },
  { name: "chart-5d-5m", days: 5, interval: "5m", prepost: false },
  { name: "chart-1mo-1h", days: 31, interval: "1h", prepost: false },
  { name: "chart-3y-1wk", days: 3 * 366, interval: "1wk", prepost: true },
  { name: "chart-all-1mo", days: 0, interval: "1mo", prepost: true },
] as const;

const MODULES = [
  "price",
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

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const OUT = join(process.cwd(), "tests/fixtures/raw");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function save(symbol: string, name: string, value: unknown) {
  const dir = join(OUT, symbol);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, `${name}.json`),
    JSON.stringify(value, null, 2) + "\n",
  );
}

async function attempt<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T | { error: string }> {
  try {
    const v = await fn();
    console.log(`  ok    ${label}`);
    return v;
  } catch (e) {
    const error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.log(`  FAIL  ${label}: ${error.slice(0, 140)}`);
    return { error };
  } finally {
    await sleep(1200);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const chartsOnly = args.includes("--charts");
  const named = args.filter((a) => !a.startsWith("--"));
  const symbols = named.length ? named : DEFAULT_SYMBOLS;
  const yearAgo = new Date(Date.now() - 365 * 864e5);
  const threeYearsAgo = new Date(Date.now() - 3 * 365 * 864e5);

  const opts = { validateResult: false } as const;

  if (chartsOnly) {
    for (const symbol of symbols) {
      console.log(symbol, "(extra charts)");
      for (const c of EXTRA_CHARTS) {
        const period1 =
          c.days === 0
            ? new Date("1970-01-02")
            : new Date(Date.now() - c.days * 864e5);
        await save(
          symbol,
          c.name,
          await attempt(c.name, () =>
            yf.chart(
              symbol,
              { period1, interval: c.interval, includePrePost: c.prepost },
              opts,
            ),
          ),
        );
      }
    }
    return;
  }

  for (const symbol of symbols) {
    console.log(symbol);

    await save(
      symbol,
      "quote",
      await attempt("quote", () => yf.quote(symbol, {}, opts)),
    );

    // One quoteSummary call per module so one missing module never hides the rest.
    const summary: Record<string, unknown> = {};
    for (const m of MODULES) {
      summary[m] = await attempt(`quoteSummary.${m}`, () =>
        yf
          .quoteSummary(symbol, { modules: [m] }, opts)
          .then((r) => (r as Record<string, unknown>)[m]),
      );
    }
    await save(symbol, "quoteSummary", summary);

    await save(
      symbol,
      "chart-1y-1d",
      await attempt("chart 1y/1d", () =>
        yf.chart(symbol, { period1: yearAgo, interval: "1d" }, opts),
      ),
    );
    await save(
      symbol,
      "chart-5d-15m",
      await attempt("chart 5d/15m", () =>
        yf.chart(
          symbol,
          { period1: new Date(Date.now() - 5 * 864e5), interval: "15m" },
          opts,
        ),
      ),
    );

    for (const type of ["quarterly", "annual"] as const) {
      await save(
        symbol,
        `fundamentals-${type}`,
        await attempt(`fundamentalsTimeSeries ${type}`, () =>
          yf.fundamentalsTimeSeries(
            symbol,
            { period1: threeYearsAgo, type, module: "all" },
            opts,
          ),
        ),
      );
    }
  }

  if (named.length) return; // searches are only re-recorded with the default set
  await save(
    "_search",
    "lvmh",
    await attempt("search lvmh", () => yf.search("lvmh", {}, opts)),
  );
  await save(
    "_search",
    "apple",
    await attempt("search apple", () => yf.search("apple", {}, opts)),
  );
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
