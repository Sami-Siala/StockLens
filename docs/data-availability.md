# Data availability matrix

Which fields StockLens can show, per kind of ticker. **Generated** by
`npx tsx scripts/build-availability-matrix.ts --live` (source: **live Yahoo**, 2026-11-05 20:39 UTC). Do not edit by hand.

How to read it: ✅ = a value came back. Anything else is a **reason code** the API returns instead of a value
(`value: null, reason: ...`), so the UI shows a labelled "not available" state, never a blank or `NaN`.

| Code          | Meaning                                                                | API `reason`              |
| ------------- | ---------------------------------------------------------------------- | ------------------------- |
| n/a (type)    | ETFs, indices, crypto have no such data                                | `not_applicable_for_type` |
| neg. earnings | loss-maker: P/E is undefined                                           | `negative_earnings`       |
| not reported  | the company does not report this line (banks have no operating income) | `not_reported`            |
| semi-annual   | company reports twice a year; use the annual series                    | `reported_less_often`     |
| no source     | Yahoo has no value for this ticker                                     | `not_provided_by_source`  |
| currency      | values in currencies we cannot safely compare; card hidden             | `currency_mismatch`       |
| ERROR         | the upstream call or its shape failed                                  | `provider_error`          |

## Matrix

| Field                                 | AAPL<br>US large cap | MC.PA<br>Paris, semi-annual | 7203.T<br>Tokyo | TSM<br>ADR (USD / TWD) | JPM<br>bank  | SPY<br>ETF | RIVN<br>loss-maker | SHEL.L<br>London (pence) | Present |
| ------------------------------------- | -------------------- | --------------------------- | --------------- | ---------------------- | ------------ | ---------- | ------------------ | ------------------------ | ------- |
| **Quote**                             |                      |                             |                 |                        |              |            |                    |                          |         |
| price + change                        | ✅                   | ✅                          | ✅              | ✅                     | ✅           | ✅         | ✅                 | ✅                       | 8/8     |
| previous close / day range / volume   | ✅                   | ✅                          | ✅              | ✅                     | ✅           | ✅         | ✅                 | ✅                       | 8/8     |
| 52-week range                         | ✅                   | ✅                          | ✅              | ✅                     | ✅           | ✅         | ✅                 | ✅                       | 8/8     |
| exchange delay (minutes)              | ✅                   | ✅                          | ✅              | ✅                     | ✅           | ✅         | ✅                 | ✅                       | 8/8     |
| **Company profile**                   |                      |                             |                 |                        |              |            |                    |                          |         |
| sector / industry / country           | ✅                   | ✅                          | ✅              | ✅                     | ✅           | ✅         | ✅                 | ✅                       | 8/8     |
| business summary (AI input)           | ✅                   | ✅                          | ✅              | ✅                     | ✅           | ✅         | ✅                 | ✅                       | 8/8     |
| **Key numbers**                       |                      |                             |                 |                        |              |            |                    |                          |         |
| market cap                            | ✅                   | ✅                          | ✅              | ✅                     | ✅           | n/a (type) | ✅                 | ✅                       | 7/8     |
| shares outstanding                    | ✅                   | ✅                          | ✅              | ✅                     | ✅           | n/a (type) | ✅                 | ✅                       | 7/8     |
| trailing P/E                          | ✅                   | ✅                          | ✅              | ✅                     | ✅           | n/a (type) | neg. earnings      | currency                 | 5/8     |
| forward P/E                           | ✅                   | ✅                          | ✅              | ✅                     | ✅           | n/a (type) | neg. earnings      | currency                 | 5/8     |
| trailing EPS                          | ✅                   | ✅                          | ✅              | ✅                     | ✅           | n/a (type) | ✅                 | ✅                       | 7/8     |
| dividend yield                        | ✅                   | ✅                          | ✅              | ✅                     | ✅           | n/a (type) | ✅                 | ✅                       | 7/8     |
| dividend rate                         | ✅                   | ✅                          | ✅              | ✅                     | ✅           | n/a (type) | not reported       | ✅                       | 6/8     |
| payout ratio (DPR)                    | ✅                   | ✅                          | ✅              | ✅                     | ✅           | n/a (type) | not reported       | ✅                       | 6/8     |
| operating margin                      | ✅                   | ✅                          | ✅              | ✅                     | ✅           | n/a (type) | ✅                 | ✅                       | 7/8     |
| revenue growth (yoy)                  | ✅                   | ✅                          | ✅              | ✅                     | ✅           | n/a (type) | ✅                 | ✅                       | 7/8     |
| beta                                  | ✅                   | ✅                          | ✅              | ✅                     | ✅           | n/a (type) | ✅                 | ✅                       | 7/8     |
| **Statements: latest quarter**        |                      |                             |                 |                        |              |            |                    |                          |         |
| revenue                               | ✅                   | semi-annual                 | ✅              | ✅                     | ✅           | n/a (type) | ✅                 | ✅                       | 6/8     |
| operating income                      | ✅                   | semi-annual                 | ✅              | ✅                     | not reported | n/a (type) | ✅                 | ✅                       | 5/8     |
| net income                            | ✅                   | semi-annual                 | ✅              | ✅                     | ✅           | n/a (type) | ✅                 | ✅                       | 6/8     |
| free cash flow                        | ✅                   | semi-annual                 | ✅              | ✅                     | ✅           | n/a (type) | ✅                 | ✅                       | 6/8     |
| diluted EPS                           | not reported         | semi-annual                 | ✅              | ✅                     | ✅           | n/a (type) | ✅                 | ✅                       | 5/8     |
| **Statements: latest fiscal year**    |                      |                             |                 |                        |              |            |                    |                          |         |
| revenue                               | ✅                   | ✅                          | ✅              | ✅                     | ✅           | n/a (type) | ✅                 | ✅                       | 7/8     |
| operating income                      | ✅                   | ✅                          | ✅              | ✅                     | not reported | n/a (type) | ✅                 | ✅                       | 6/8     |
| net income                            | ✅                   | ✅                          | ✅              | ✅                     | ✅           | n/a (type) | ✅                 | ✅                       | 7/8     |
| free cash flow                        | ✅                   | ✅                          | ✅              | ✅                     | ✅           | n/a (type) | ✅                 | ✅                       | 7/8     |
| rows available (3 expected)           | ✅                   | ✅                          | ✅              | ✅                     | ✅           | n/a (type) | ✅                 | ✅                       | 7/8     |
| **Earnings**                          |                      |                             |                 |                        |              |            |                    |                          |         |
| EPS actual vs estimate (last quarter) | ✅                   | no source                   | ✅              | ✅                     | ✅           | n/a (type) | ✅                 | ✅                       | 6/8     |
| EPS history (4 quarters)              | ✅                   | none                        | ✅              | ✅                     | ✅           | n/a (type) | ✅                 | ✅                       | 6/8     |
| next report date                      | ✅                   | no source                   | ✅              | ✅                     | ✅           | n/a (type) | no source          | no source                | 4/8     |
| forward EPS estimates                 | ✅                   | ✅                          | ✅              | ✅                     | ✅           | n/a (type) | ✅                 | ✅                       | 7/8     |
| forward revenue estimates             | ✅                   | ✅                          | ✅              | ✅                     | ✅           | n/a (type) | ✅                 | ✅                       | 7/8     |
| **Analysts**                          |                      |                             |                 |                        |              |            |                    |                          |         |
| buy / hold / sell counts              | ✅                   | ✅                          | ✅              | ✅                     | ✅           | n/a (type) | ✅                 | ✅                       | 7/8     |
| mean rating                           | ✅                   | ✅                          | ✅              | ✅                     | ✅           | n/a (type) | ✅                 | ✅                       | 7/8     |
| price target (low / mean / high)      | ✅                   | ✅                          | ✅              | ✅                     | ✅           | n/a (type) | ✅                 | ✅                       | 7/8     |
| **Charts (candles returned)**         |                      |                             |                 |                        |              |            |                    |                          |         |
| 1H                                    | ✅                   | ✅                          | ✅              | ✅                     | ✅           | ✅         | ✅                 | ✅                       | 8/8     |
| 1D                                    | ✅                   | ✅                          | ✅              | ✅                     | ✅           | ✅         | ✅                 | ✅                       | 8/8     |
| 1W                                    | ✅                   | ✅                          | ✅              | ✅                     | ✅           | ✅         | ✅                 | ✅                       | 8/8     |
| 1M                                    | ✅                   | ✅                          | ✅              | ✅                     | ✅           | ✅         | ✅                 | ✅                       | 8/8     |
| 1Y                                    | ✅                   | ✅                          | ✅              | ✅                     | ✅           | ✅         | ✅                 | ✅                       | 8/8     |
| 3Y                                    | ✅                   | ✅                          | ✅              | ✅                     | ✅           | ✅         | ✅                 | ✅                       | 8/8     |
| 5Y                                    | ✅                   | ✅                          | ✅              | ✅                     | ✅           | ✅         | ✅                 | ✅                       | 8/8     |
| ALL                                   | ✅                   | ✅                          | ✅              | ✅                     | ✅           | ✅         | ✅                 | ✅                       | 8/8     |

## What this means for the UI

- **Safe to build a card** when the row is present in 7 of 8 columns (the only gap is the ETF): quote, profile, market cap, shares,
  EPS, dividend yield, operating margin, revenue growth, annual statements, analyst ratings and targets, forward estimates.
  Every card still needs the "not available" state, because the 8 columns are a sample, not a guarantee.
- **Rows below 7/8 need a first-class empty state** (a labelled message with the reason, never a silent blank):
  - _EPS actual vs estimate_ is missing for LVMH and for ETFs. Yahoo returns empty `earningsHistory` for many non-US companies.
  - _Forward revenue estimate_ exists (`earnings.revenueEstimates`), but there is **no past revenue beat/miss** anywhere: Yahoo does not provide it.
  - _Quarterly statements_ are hollow for semi-annual reporters (LVMH): use `fundamentals.primaryView` to pick the annual series.
  - _Operating income_ is `not_reported` for banks (JPM). Free cash flow does come back for banks, but it is not comparable with industrials.
  - _Trailing P/E_ is `negative_earnings` for loss-makers (Rivian); forward P/E can be negative too (same reason).
  - _P/E, EPS and price-target cards_ can be `currency` for cross-listings whose price and statements use different currencies (Shell: GBP price, USD earnings).
    The API hides them instead of dividing mismatched currencies.
- **ETFs/indices** (SPY): quote, chart and profile summary only. Fundamentals, earnings and analysts are `not_applicable_for_type`.
- **London (and Johannesburg, Tel Aviv)**: Yahoo quotes pence/cents; the API converts to the major currency (GBP, ZAR, ILS) and discloses it in
  `listing.priceSubunit`. The UI never has to know about `GBp`.
- **Next report date** is only shown when it is upcoming (a date more than 2 days in the past is dropped).
- **Charts**: every range returns candles for tickers with price history. 1H/1D on a closed market return the last trading hour/day
  and set `fallback` plus `marketClosed`.

## Home dashboard endpoints (contract v0.3.0)

Two batch endpoints feed the home page (PLAN §4.3). Both read the same shared cache as the stock page.

| Endpoint                        | Returns                                                                | Upstream cost (cold)                                   | Cache                                     |
| ------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------- |
| `GET /api/quotes?symbols=A,B,C` | `QuotesResponse`: one `QuoteLite` per symbol, failures inline per item | 1 batched `quote()` + 1 daily `chart()` per new symbol | price 45 s, sparkline 30 min, stale 3-7 d |
| `GET /api/market`               | `MarketResponse`: 3 open/closed chips + 8 index items                  | 1 batched `quote()` + 8 daily `chart()`                | price 60 s, sparkline 30 min, stale 3-7 d |

- `symbols`: 1 to 25 tickers, trimmed, upper-cased, de-duplicated, order kept. A bad ticker comes back as `status: "invalid"` and is never sent to Yahoo; an unknown one is `not_found` (remembered 5 min); a failed call is `unavailable` or, when an old copy exists, `ok` with `stale: true`. Only an empty or oversized list is a 400.
- **Sparkline** = daily closes of the last ~6 weeks (about 30 trading days), thinned to at most 30 points, in the major currency unit. Daily bars were chosen over intraday because a 5-minute line is flat before the open and after the close and means something different in every time zone. The last point is the latest (possibly partial) session.
- **Next report date** comes free with the batched `quote()` (no `quoteSummary` call): upcoming dates only, anything more than 2 days old is dropped (`not_provided_by_source`); ETFs, indices, FX and futures are `not_applicable_for_type`.
- Price entries are shared with the stock page (`core:SYMBOL`): opening a company from the watchlist costs no extra `quote()`, and the reverse.
- **Market chips** use Yahoo's `marketState` of a reference index (`^GSPC` for NYSE/Nasdaq, `^FCHI` for Euronext Paris, `^N225` for Tokyo), which knows about holidays. If that quote is missing or only a stale copy, the chip falls back to weekday plus regular hours in the exchange's time zone and says so (`basis: "schedule"`, no holiday calendar).

### Index strip: every symbol verified live on 2026-11-05

| Symbol      | Label            | `kind`   | Yahoo type / exchange | Yahoo currency | Delay | Notes                                                                                                                             |
| ----------- | ---------------- | -------- | --------------------- | -------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| `^GSPC`     | S&P 500          | `index`  | INDEX / SNP           | USD            | 0     | Points. `priceCurrency` is `null`.                                                                                                |
| `^IXIC`     | Nasdaq Composite | `index`  | INDEX / NIM           | USD            | 0     | Points.                                                                                                                           |
| `^FCHI`     | CAC 40           | `index`  | INDEX / PAR           | EUR            | 15    | Points.                                                                                                                           |
| `^STOXX50E` | Euro Stoxx 50    | `index`  | INDEX / ZRH           | EUR            | 0     | Yahoo pads the name with spaces and a stray "I"; the contract uses our own `label`.                                               |
| `^N225`     | Nikkei 225       | `index`  | INDEX / OSA           | JPY            | 20    | Points. Fewer sparkline points (Japanese holidays).                                                                               |
| `EURUSD=X`  | EUR/USD          | `fx`     | CURRENCY / CCY        | USD            | 0     | An exchange rate (1 EUR = 1.12 USD), not a price in dollars. Trades around the clock (`REGULAR`).                                 |
| `GC=F`      | Gold             | `future` | FUTURE / CMX          | USD            | 10    | USD per troy ounce, but the **front-month contract** ("Gold Dec 26"): it rolls and is not the spot price.                         |
| `^TNX`      | US 10-year yield | `yield`  | INDEX / CGI           | USD            | 15    | A percent LEVEL (4.84 = 4.84 %). Show `change` in percentage points; `changePercent` is a relative move of the rate and misleads. |

All eight worked on the first try; none needs a substitute. For `index`, `fx` and `yield` the contract sets `priceCurrency: null` (a level, not money);
only the gold future keeps `USD`.

### `QuoteLite` fields across tickers (live, same day)

| Field                          | AAPL      | MC.PA                               | 7203.T     | SPY        | TSM       | Indices / FX / gold / yield |
| ------------------------------ | --------- | ----------------------------------- | ---------- | ---------- | --------- | --------------------------- |
| price, change, change %        | ✅        | ✅                                  | ✅         | ✅         | ✅        | ✅ (8/8)                    |
| market state, delay, as-of     | ✅        | ✅                                  | ✅         | ✅         | ✅        | ✅ (8/8)                    |
| sparkline (<= 30 daily points) | ✅        | ✅                                  | ✅ (27)    | ✅         | ✅        | ✅ (7 x 30, `^N225` 27)     |
| next report date               | ✅ (est.) | no source (stale July date dropped) | ✅ (today) | n/a (type) | ✅ (est.) | n/a (type)                  |

Cost of one dashboard load (market + a 5-symbol list) measured live: **2 batched `quote()` + 13 `chart()` = 15 upstream calls**, then **0** for the next
45-60 s and **2 `quote()`** per minute afterwards (sparklines live 30 min). Every symbol is fetched at most once, however many students ask.
