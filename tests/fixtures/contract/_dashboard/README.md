# Dashboard fixtures (contract v0.3.0)

Contract-shaped bodies of `GET /api/quotes` and `GET /api/market`, built from real Yahoo recordings
(`tests/fixtures/raw/_dashboard`) by `npx tsx scripts/build-dashboard-fixtures.ts`.

| File                   | What it shows                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `quotes.json`          | 11 entries: 8 `ok` (AAPL stale, MC.PA, 7203.T, SPY, TSM, SHEL.L in pounds, JPM, RIVN), `unavailable`, `not_found`, `invalid` |
| `market.json`          | The real recording: every market closed (US after-hours, Paris and Tokyo closed), 8 index items with sparklines              |
| `market-open.json`     | Same, US session open (synthetic edit of the chip and two index states)                                                      |
| `market-degraded.json` | `^STOXX50E` failed (`provider_error`), `^TNX` served stale, `meta.stale: true`                                               |

The `NVDA` (`unavailable`) and `NOT A TICKER` (`invalid`) entries and the two market variants are hand-edited
to show failure shapes; everything else is produced by the real provider.
