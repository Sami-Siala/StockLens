/**
 * Records the RAW Yahoo payloads behind the home dashboard (contract v0.3.0) into
 * tests/fixtures/raw/_dashboard/. Run manually, never in CI:
 *
 *   npx tsx scripts/record-dashboard-fixtures.ts
 *
 * Writes:
 *   quotes.json         ONE batched quote() call for the index strip + a spread of tickers
 *                       (plus a bogus symbol, to record that Yahoo simply omits unknown ones)
 *   spark-<SYMBOL>.json the sparkline chart call (1d bars, last 42 days) per symbol
 */
import "./shim-server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MemoryStore } from "../lib/providers/cache/memory";
import {
  MARKET_SYMBOLS,
  SPARKLINE_LOOKBACK_MS,
} from "../lib/providers/normalize/lite";
import { createYahooClient } from "../lib/providers/yahoo-client";

const EXTRA = [
  "AAPL",
  "MC.PA",
  "7203.T",
  "SPY",
  "TSM",
  "SHEL.L",
  "JPM",
  "RIVN",
];
const BOGUS = "ZZZNOTREAL123";
const OUT = join(process.cwd(), "tests/fixtures/raw/_dashboard");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mkdir(OUT, { recursive: true });
  const client = createYahooClient(new MemoryStore());
  const symbols = [...MARKET_SYMBOLS, ...EXTRA];
  const rows = (await client.quotes([...symbols, BOGUS])) as unknown[];
  await writeFile(
    join(OUT, "quotes.json"),
    JSON.stringify(rows, null, 2) + "\n",
  );
  console.log(
    `quotes.json: ${rows.length} rows for ${symbols.length + 1} requested`,
  );
  for (const s of symbols) {
    await sleep(700);
    const chart = await client.chart(s, {
      period1: new Date(Date.now() - SPARKLINE_LOOKBACK_MS),
      interval: "1d",
      includePrePost: false,
    });
    await writeFile(
      join(OUT, `spark-${s}.json`),
      JSON.stringify(chart, null, 2) + "\n",
    );
    console.log(`spark-${s}.json`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
