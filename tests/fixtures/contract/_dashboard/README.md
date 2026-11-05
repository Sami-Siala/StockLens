# Dashboard fixtures (contract v0.3.0)

Contract-shaped bodies of `GET /api/quotes` and `GET /api/market`, built from real Yahoo recordings
(`tests/fixtures/raw/_dashboard`) by `npx tsx scripts/build-dashboard-fixtures.ts`.

| File                   | What it shows                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `quotes.json`          | 11 entries: 8 `ok` (AAPL stale, MC.PA, 7203.T, SPY, TSM, SHEL.L in pounds, JPM, RIVN), `unavailable`, `not_found`, `invalid` |
| `market.json`          | The real recording: every market closed (US after-hours, Paris and Tokyo closed), 8 index items with sparklines              |
| `market-open.json`     | Same, US session open (synthetic edit of the chip and two index states)                                                      |
| `ticker.json`          | `GET /api/ticker` (**v0.3.1**): 25 items in order, real recording; `^BVSP` is `unavailable` (all numbers null) and `^HSI` is `stale` (hand-edited; `meta.stale: true`) |
| `market-degraded.json` | `^STOXX50E` failed (`provider_error`), `^TNX` served stale, `meta.stale: true`                                               |

Regenerate `ticker.json` with `npx tsx scripts/build-dashboard-fixtures.ts`; the raw batch is `tests/fixtures/raw/_dashboard/ticker-quotes.json` (`scripts/record-ticker-fixtures.ts`). The other files keep their original `0.3.0` stamp (additive contract).

The `NVDA` (`unavailable`) and `NOT A TICKER` (`invalid`) entries and the two market variants are hand-edited
to show failure shapes; everything else is produced by the real provider.
