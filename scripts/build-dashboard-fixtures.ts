/**
 * Raw dashboard recordings -> contract-shaped fixtures for the home dashboard (contract v0.3.0),
 * using the REAL provider and service end to end:
 *
 *   npx tsx scripts/build-dashboard-fixtures.ts
 *
 * Writes tests/fixtures/contract/_dashboard/:
 *   quotes.json           an 11-entry GET /api/quotes: 8 ok (US, Paris, Tokyo, ETF, ADR, pence,
 *                         bank, loss-maker), one STALE, one `unavailable`, one `not_found`, one `invalid`
 *   market.json           GET /api/market as recorded: every market CLOSED (after the US close)
 *   market-open.json      the same with the US session OPEN (synthetic: chip + two index states edited)
 *   market-degraded.json  one index failed (`provider_error`) and one served stale
 * Deterministic (fixed "now"), so a re-run only produces a diff when the normaliser changes.
 */
import "./shim-server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  MarketResponse,
  QuoteEntry,
  QuotesResponse,
} from "../lib/contract";
import { MemoryStore } from "../lib/providers/cache/memory";
import { ProviderError } from "../lib/providers/errors";
import { DataService } from "../lib/providers/service";
import { YahooProvider } from "../lib/providers/yahoo";
import { FakeYahooClient } from "../tests/helpers/fake-yahoo";

const OUT = join(process.cwd(), "tests/fixtures/contract/_dashboard");
const AT = new Date("2026-11-05T21:30:00Z"); // shortly after the recordings
const write = (name: string, body: unknown) =>
  writeFile(join(OUT, name), JSON.stringify(body, null, 2) + "\n");

const clock = { t: AT.getTime() };
const client = new FakeYahooClient();
const service = new DataService({
  provider: new YahooProvider(client, () => new Date(clock.t)),
  store: new MemoryStore(() => clock.t),
  now: () => clock.t,
});
const items = (symbols: string[]) =>
  symbols.map((symbol) => ({ symbol, valid: true }));

async function main() {
  await mkdir(OUT, { recursive: true });

  // ---- market.json (real, closed) ------------------------------------------------
  const market: MarketResponse = await service.getMarket();
  market.meta.source = "fixture";
  await write("market.json", market);

  // ---- quotes.json -----------------------------------------------------------------
  const ok = await service.getQuotes(
    items(["AAPL", "MC.PA", "7203.T", "SPY", "TSM", "SHEL.L", "JPM", "RIVN"]),
  );
  // A stale entry: refresh AAPL while Yahoo is down, after its soft TTL expired.
  clock.t += 5 * 60_000;
  client.opts.fail = { quotes: new ProviderError("upstream", "429") };
  const stale = await service.getQuotes(items(["AAPL"]));
  client.opts.fail = {};
  const bogus = await service.getQuotes(items(["ZZZNOTREAL123"]));
  const unavailable: QuoteEntry = {
    symbol: "NVDA",
    status: "unavailable",
    quote: { value: null, reason: "provider_error" },
    stale: false,
  };
  const invalid: QuoteEntry = {
    symbol: "NOT A TICKER",
    status: "invalid",
    quote: { value: null, reason: "not_provided_by_source" },
    stale: false,
  };
  const quotes: QuotesResponse = {
    meta: { ...ok.meta, source: "fixture", stale: true },
    entries: [
      stale.entries[0], // AAPL, stale: true
      ...ok.entries.slice(1),
      unavailable,
      bogus.entries[0], // not_found
      invalid,
    ],
  };
  await write("quotes.json", quotes);

  // ---- market-open.json (synthetic: US session open) ------------------------------
  const open: MarketResponse = structuredClone(market);
  open.status[0] = { ...open.status[0], marketState: "REGULAR", isOpen: true };
  for (const i of open.indices)
    if (i.symbol === "^GSPC" || i.symbol === "^IXIC")
      if (i.quote.value) i.quote.value.marketState = "REGULAR";
  await write("market-open.json", open);

  // ---- market-degraded.json ----------------------------------------------------------
  const degraded: MarketResponse = structuredClone(market);
  degraded.meta.stale = true;
  const stoxx = degraded.indices.find((i) => i.symbol === "^STOXX50E")!;
  stoxx.quote = { value: null, reason: "provider_error" };
  degraded.indices.find((i) => i.symbol === "^TNX")!.stale = true;
  // Without a fresh Yahoo state for the stale item the chips would still be fine (US/Paris/Tokyo
  // use ^GSPC/^FCHI/^N225); only an unusable reference index switches a chip to the schedule.
  await write("market-degraded.json", degraded);

  console.log(
    `quotes.json ${quotes.entries.length} entries, market.json ${market.indices.length} items`,
  );
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
