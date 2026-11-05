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

## Market ticker band: \`GET /api/ticker\` (contract v0.3.1)

One cheap endpoint for the scrolling band: **25 items** in a fixed order (Americas, Europe, Asia-Pacific, then VIX and the macro trio), **no sparklines**.

- **Upstream cost:** one batched \`quote()\` for every symbol that is not fresh and **zero \`chart()\` calls**. Cold load measured live: **1 \`quote()\` + 0 \`chart()\`**. Price entries are the same \`core:SYMBOL\` cache entries as the stock page, the watchlist and \`/api/market\`: 60 s soft TTL, 3-day stale copy, one batch for the whole class (15 parallel cold requests = 1 call, proven in \`tests/providers/ticker.test.ts\`).
- **Failures stay per item:** a symbol Yahoo omits or fails on is \`status: "unavailable"\` with every number \`null\` and \`marketState: "UNKNOWN"\`; one served from the stale copy is \`status: "ok"\` with \`stale: true\`. The route itself only fails if the response cannot be built at all (it returns 200 with 25 unavailable items when Yahoo is down and nothing is cached).
- **Formatting by \`kind\`** follows \`IndexKind\` (points / rate / yield / futures) plus \`volatility\` (the VIX, a level in points; both \`change\` and \`changePercent\` are meaningful). Only the gold future carries \`priceCurrency\` (\`USD\`); every other item is \`null\`.
- The list lives in \`lib/providers/ticker-config.ts\` (id, our own short label, region, kind, symbol). Overlap with \`/api/market\` is deliberate: whoever asks first fetches, the other reads the cache (if both are cold in the same instant the overlapping 8 are fetched once and the rest in a second batch).

### Ticker symbols: every one verified live on 2026-11-05

All 25 symbols were returned by **one** batched Yahoo \`quote()\` with a price. **None failed; no substitute is needed.**

| Region          | Symbols (label)                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| \`americas\`      | \`^GSPC\` S&P 500, \`^DJI\` Dow Jones, \`^IXIC\` Nasdaq Composite, \`^NDX\` Nasdaq 100, \`^RUT\` Russell 2000 (15 min delay), \`^GSPTSE\` S&P/TSX, \`^BVSP\` Bovespa (15 min delay)                  |
| \`europe\`        | \`^FCHI\` CAC 40, \`^GDAXI\` DAX, \`^FTSE\` FTSE 100, \`^STOXX50E\` Euro Stoxx 50, \`^IBEX\` IBEX 35, \`FTSEMIB.MI\` FTSE MIB, \`^SSMI\` SMI, \`^AEX\` AEX                                            |
| \`asia_pacific\`  | \`^N225\` Nikkei 225, \`^HSI\` Hang Seng, \`000001.SS\` Shanghai Composite, \`^KS11\` KOSPI, \`^NSEI\` Nifty 50, \`^AXJO\` ASX 200                                                                |
| \`other\`         | \`^VIX\` VIX (\`volatility\`), \`EURUSD=X\` EUR/USD (\`fx\`), \`GC=F\` Gold (\`future\`, USD), \`^TNX\` US 10Y yield (\`yield\`, percentage-point \`change\`)                                            |

Quirks seen live: all are \`INDEX\` except EUR/USD (\`CURRENCY\`) and gold (\`FUTURE\`); Yahoo's own names are padded or odd (\`DAX                           P\`, \`SMI PR\`, \`EURO STOXX 50                 I\`), which is why the contract carries our own \`label\`.
Exchange delays are 0 (US, TSX, Euro Stoxx 50, AEX, FX), 10 (gold), 15 (most others) or 20 minutes (Nikkei, KOSPI, ASX). Yahoo reports \`PREPRE\` / \`POSTPOST\` outside sessions: both are mapped to \`CLOSED\`.
Outside US hours Yahoo can report \`PRE\` for ASX 200 and \`POST\` for the VIX/US indices: the band shows what Yahoo says, per item.
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
