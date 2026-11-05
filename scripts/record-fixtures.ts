/**
 * Records RAW Yahoo payloads (via yahoo-finance2) into tests/fixtures/raw/<SYMBOL>/.
 * These recordings are the source the data contract (lib/contract) is derived from,
 * and the input for the normalizer tests in Step 2. Run manually, never in CI:
 *
 *   npx tsx scripts/record-fixtures.ts            # default symbol set
 *   npx tsx scripts/record-fixtures.ts AAPL SPY   # chosen symbols
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
];

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
  const symbols = process.argv.slice(2).length
    ? process.argv.slice(2)
    : DEFAULT_SYMBOLS;
  const yearAgo = new Date(Date.now() - 365 * 864e5);
  const threeYearsAgo = new Date(Date.now() - 3 * 365 * 864e5);

  for (const symbol of symbols) {
    console.log(symbol);
    const opts = { validateResult: false } as const;

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

  await save(
    "_search",
    "lvmh",
    await attempt("search lvmh", () => yf.search("lvmh", {}, opts0())),
  );
  await save(
    "_search",
    "apple",
    await attempt("search apple", () => yf.search("apple", {}, opts0())),
  );
}
const opts0 = () => ({ validateResult: false }) as const;

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
