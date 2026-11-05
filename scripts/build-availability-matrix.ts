/**
 * Generates docs/data-availability.md: which fields come back for which kind of ticker.
 *
 *   npx tsx scripts/build-availability-matrix.ts          # from the recorded payloads (offline, deterministic)
 *   npx tsx scripts/build-availability-matrix.ts --live   # from live Yahoo (slow, rate-limited; run rarely)
 *
 * The matrix is the input to the UI's decision of which cards to build: only fields present in
 * most columns get a card; the rest show a labelled "not available" state.
 */
import "./shim-server-only";
import { writeFile } from "node:fs/promises";
import { format } from "prettier";
import { join } from "node:path";
import type { ChartRange, ChartResponse } from "../lib/contract";
import { MemoryStore } from "../lib/providers/cache/memory";
import { DataService } from "../lib/providers/service";
import { YahooProvider } from "../lib/providers/yahoo";
import { createYahooClient } from "../lib/providers/yahoo-client";
import { FakeYahooClient } from "../tests/helpers/fake-yahoo";
import { extractFields, renderMatrix, type MatrixColumn } from "./availability";

const COLUMNS: Array<[string, string]> = [
  ["AAPL", "US large cap"],
  ["MC.PA", "Paris, semi-annual"],
  ["7203.T", "Tokyo"],
  ["TSM", "ADR (USD / TWD)"],
  ["JPM", "bank"],
  ["SPY", "ETF"],
  ["RIVN", "loss-maker"],
  ["SHEL.L", "London (pence)"],
];
const RANGES: ChartRange[] = ["1H", "1D", "1W", "1M", "1Y", "3Y", "5Y", "ALL"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const live = process.argv.includes("--live");
  const now = live ? new Date() : new Date("2026-11-05T20:30:00Z");
  const t = () => now.getTime();
  const store = new MemoryStore();
  const client = live ? createYahooClient(store) : new FakeYahooClient();
  const service = new DataService({
    provider: new YahooProvider(client, () => (live ? new Date() : now)),
    store,
    now: live ? Date.now : t,
  });

  const cols: MatrixColumn[] = [];
  for (const [symbol, label] of COLUMNS) {
    const snap = await service.getStock(symbol);
    const charts: Record<string, ChartResponse | null> = {};
    for (const r of RANGES) {
      try {
        charts[r] = await service.getChart(symbol, r);
      } catch {
        charts[r] = null;
      }
      if (live) await sleep(600);
    }
    cols.push({
      symbol,
      label,
      fields: extractFields(snap, live ? charts : undefined),
    });
    console.log("done", symbol);
    if (live) await sleep(1500);
  }

  const when = now.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  const md = `# Data availability matrix

Which fields StockLens can show, per kind of ticker. **Generated** by
\`npx tsx scripts/build-availability-matrix.ts${live ? " --live" : ""}\` (source: ${
    live
      ? `**live Yahoo**, ${when}`
      : `payloads recorded from real Yahoo on 2026-11-05 (\`tests/fixtures/raw\`); re-run with \`--live\` to refresh`
  }). Do not edit by hand.

How to read it: ✅ = a value came back. Anything else is a **reason code** the API returns instead of a value
(\`value: null, reason: ...\`), so the UI shows a labelled "not available" state, never a blank or \`NaN\`.

| Code | Meaning | API \`reason\` |
|---|---|---|
| n/a (type) | ETFs, indices, crypto have no such data | \`not_applicable_for_type\` |
| neg. earnings | loss-maker: P/E is undefined | \`negative_earnings\` |
| not reported | the company does not report this line (banks have no operating income) | \`not_reported\` |
| semi-annual | company reports twice a year; use the annual series | \`reported_less_often\` |
| no source | Yahoo has no value for this ticker | \`not_provided_by_source\` |
| currency | values in currencies we cannot safely compare; card hidden | \`currency_mismatch\` |
| ERROR | the upstream call or its shape failed | \`provider_error\` |

## Matrix

${renderMatrix(cols)}

## What this means for the UI

- **Safe to build a card** when the row is present in 7 of 8 columns (the only gap is the ETF): quote, profile, market cap, shares,
  EPS, dividend yield, operating margin, revenue growth, annual statements, analyst ratings and targets, forward estimates.
  Every card still needs the "not available" state, because the 8 columns are a sample, not a guarantee.
- **Rows below 7/8 need a first-class empty state** (a labelled message with the reason, never a silent blank):
  - *EPS actual vs estimate* is missing for LVMH and for ETFs. Yahoo returns empty \`earningsHistory\` for many non-US companies.
  - *Forward revenue estimate* exists (\`earnings.revenueEstimates\`), but there is **no past revenue beat/miss** anywhere: Yahoo does not provide it.
  - *Quarterly statements* are hollow for semi-annual reporters (LVMH): use \`fundamentals.primaryView\` to pick the annual series.
  - *Operating income* is \`not_reported\` for banks (JPM). Free cash flow does come back for banks, but it is not comparable with industrials.
  - *Trailing P/E* is \`negative_earnings\` for loss-makers (Rivian); forward P/E can be negative too (same reason).
  - *P/E, EPS and price-target cards* can be \`currency\` for cross-listings whose price and statements use different currencies (Shell: GBP price, USD earnings).
    The API hides them instead of dividing mismatched currencies.
- **ETFs/indices** (SPY): quote, chart and profile summary only. Fundamentals, earnings and analysts are \`not_applicable_for_type\`.
- **London (and Johannesburg, Tel Aviv)**: Yahoo quotes pence/cents; the API converts to the major currency (GBP, ZAR, ILS) and discloses it in
  \`listing.priceSubunit\`. The UI never has to know about \`GBp\`.
- **Next report date** is only shown when it is upcoming (a date more than 2 days in the past is dropped).
- **Charts**: every range returns candles for tickers with price history. 1H/1D on a closed market return the last trading hour/day
  and set \`fallback\` plus \`marketClosed\`.

## Home dashboard endpoints (contract v0.3.0)

Two batch endpoints feed the home page (PLAN §4.3). Both read the same shared cache as the stock page.

| Endpoint                         | Returns                                                                | Upstream cost (cold)                                      | Cache                                      |
| -------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------ |
| \`GET /api/quotes?symbols=A,B,C\`  | \`QuotesResponse\`: one \`QuoteLite\` per symbol, failures inline per item | 1 batched \`quote()\` + 1 daily \`chart()\` per new symbol    | price 45 s, sparkline 30 min, stale 3-7 d  |
| \`GET /api/market\`                | \`MarketResponse\`: 3 open/closed chips + 8 index items                  | 1 batched \`quote()\` + 8 daily \`chart()\`                   | price 60 s, sparkline 30 min, stale 3-7 d  |

- \`symbols\`: 1 to 25 tickers, trimmed, upper-cased, de-duplicated, order kept. A bad ticker comes back as \`status: "invalid"\` and is never sent to Yahoo; an unknown one is \`not_found\` (remembered 5 min); a failed call is \`unavailable\` or, when an old copy exists, \`ok\` with \`stale: true\`. Only an empty or oversized list is a 400.
- **Sparkline** = daily closes of the last ~6 weeks (about 30 trading days), thinned to at most 30 points, in the major currency unit. Daily bars were chosen over intraday because a 5-minute line is flat before the open and after the close and means something different in every time zone. The last point is the latest (possibly partial) session.
- **Next report date** comes free with the batched \`quote()\` (no \`quoteSummary\` call): upcoming dates only, anything more than 2 days old is dropped (\`not_provided_by_source\`); ETFs, indices, FX and futures are \`not_applicable_for_type\`.
- Price entries are shared with the stock page (\`core:SYMBOL\`): opening a company from the watchlist costs no extra \`quote()\`, and the reverse.
- **Market chips** use Yahoo's \`marketState\` of a reference index (\`^GSPC\` for NYSE/Nasdaq, \`^FCHI\` for Euronext Paris, \`^N225\` for Tokyo), which knows about holidays. If that quote is missing or only a stale copy, the chip falls back to weekday plus regular hours in the exchange's time zone and says so (\`basis: "schedule"\`, no holiday calendar).

### Index strip: every symbol verified live on 2026-11-05

| Symbol      | Label            | \`kind\`   | Yahoo type / exchange | Yahoo currency | Delay | Notes                                                                                                   |
| ----------- | ---------------- | -------- | --------------------- | -------------- | ----- | ------------------------------------------------------------------------------------------------------- |
| \`^GSPC\`     | S&P 500          | \`index\`  | INDEX / SNP           | USD            | 0     | Points. \`priceCurrency\` is \`null\`.                                                                      |
| \`^IXIC\`     | Nasdaq Composite | \`index\`  | INDEX / NIM           | USD            | 0     | Points.                                                                                                 |
| \`^FCHI\`     | CAC 40           | \`index\`  | INDEX / PAR           | EUR            | 15    | Points.                                                                                                 |
| \`^STOXX50E\` | Euro Stoxx 50    | \`index\`  | INDEX / ZRH           | EUR            | 0     | Yahoo pads the name with spaces and a stray "I"; the contract uses our own \`label\`.                     |
| \`^N225\`     | Nikkei 225       | \`index\`  | INDEX / OSA           | JPY            | 20    | Points. Fewer sparkline points (Japanese holidays).                                                     |
| \`EURUSD=X\`  | EUR/USD          | \`fx\`     | CURRENCY / CCY        | USD            | 0     | An exchange rate (1 EUR = 1.12 USD), not a price in dollars. Trades around the clock (\`REGULAR\`).       |
| \`GC=F\`      | Gold             | \`future\` | FUTURE / CMX          | USD            | 10    | USD per troy ounce, but the **front-month contract** ("Gold Dec 26"): it rolls and is not the spot price. |
| \`^TNX\`      | US 10-year yield | \`yield\`  | INDEX / CGI           | USD            | 15    | A percent LEVEL (4.84 = 4.84 %). Show \`change\` in percentage points; \`changePercent\` is a relative move of the rate and misleads. |

All eight worked on the first try; none needs a substitute. For \`index\`, \`fx\` and \`yield\` the contract sets \`priceCurrency: null\` (a level, not money);
only the gold future keeps \`USD\`.

### \`QuoteLite\` fields across tickers (live, same day)

| Field                          | AAPL | MC.PA                 | 7203.T | SPY             | TSM  | Indices / FX / gold / yield |
| ------------------------------ | ---- | --------------------- | ------ | --------------- | ---- | --------------------------- |
| price, change, change %        | ✅   | ✅                    | ✅     | ✅              | ✅   | ✅ (8/8)                    |
| market state, delay, as-of     | ✅   | ✅                    | ✅     | ✅              | ✅   | ✅ (8/8)                    |
| sparkline (<= 30 daily points) | ✅   | ✅                    | ✅ (27) | ✅              | ✅   | ✅ (7 x 30, \`^N225\` 27)     |
| next report date               | ✅ (est.) | no source (stale July date dropped) | ✅ (today) | n/a (type) | ✅ (est.) | n/a (type)       |

Cost of one dashboard load (market + a 5-symbol list) measured live: **2 batched \`quote()\` + 13 \`chart()\` = 15 upstream calls**, then **0** for the next
45-60 s and **2 \`quote()\`** per minute afterwards (sparklines live 30 min). Every symbol is fetched at most once, however many students ask.
`;
  // Same formatting as `npm run format`, so a regenerated file never shows up as a format diff.
  await writeFile(
    join(process.cwd(), "docs/data-availability.md"),
    await format(md, { parser: "markdown" }),
  );
  console.log(
    "wrote docs/data-availability.md",
    live ? "(live)" : "(recorded)",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
