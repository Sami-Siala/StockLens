/**
 * Records the RAW Yahoo payload behind GET /api/ticker (contract v0.3.1) into
 * tests/fixtures/raw/_dashboard/ticker-quotes.json. Run manually, never in CI:
 *
 *   npx tsx scripts/record-ticker-fixtures.ts
 *
 * ONE batched quote() for every symbol of lib/providers/ticker-config.ts, and it reports any
 * symbol Yahoo did not return (those must be dropped from the config).
 */
import "./shim-server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MemoryStore } from "../lib/providers/cache/memory";
import { TICKER_SYMBOLS } from "../lib/providers/ticker-config";
import { createYahooClient } from "../lib/providers/yahoo-client";

const OUT = join(process.cwd(), "tests/fixtures/raw/_dashboard");

async function main() {
  await mkdir(OUT, { recursive: true });
  const rows = (await createYahooClient(new MemoryStore()).quotes(
    TICKER_SYMBOLS,
  )) as Array<{ symbol?: string; regularMarketPrice?: number }>;
  await writeFile(
    join(OUT, "ticker-quotes.json"),
    JSON.stringify(rows, null, 2) + "\n",
  );
  const missing = TICKER_SYMBOLS.filter(
    (s) => !rows.some((r) => r.symbol === s && r.regularMarketPrice != null),
  );
  console.log(
    `ticker-quotes.json: ${rows.length} rows for ${TICKER_SYMBOLS.length} symbols; missing/no price: ${missing.join(", ") || "none"}`,
  );
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
