# StockLens

A free, bilingual (FR / EN), beginner-friendly web app to understand any listed company:
price chart, key numbers vs. analyst expectations, analyst sentiment, and an AI-written
plain-language explanation. **Educational content, not financial advice.**

The full plan, decisions and open questions are in [`PLAN.md`](./PLAN.md).
Design rules are in [`docs/design-notes.md`](./docs/design-notes.md).

## Status

Step 1 (foundations) in progress. See PLAN.md §11.

## Develop

Requires Node 22+ (developed on 24).

```bash
npm ci
cp .env.example .env.local   # fill in later steps; nothing is required to run the shell
npm run dev                  # http://localhost:3000  (redirects to /fr)
npm run check                # typecheck + lint + tests
```

| Script                    | What it does                                                                  |
| ------------------------- | ----------------------------------------------------------------------------- |
| `npm run fixtures:record` | Re-record raw Yahoo payloads into `tests/fixtures/raw` (manual, rate-limited) |
| `npm run fixtures:build`  | Rebuild contract-shaped fixtures in `tests/fixtures/contract`                 |
| `npm run soak`            | Yahoo soak test against a deployed spike endpoint (see `scripts/soak.ts`)     |

## Layout

`app/` routes · `components/` UI · `lib/contract/` shared data types (versioned) ·
`lib/providers/` server-only market data · `lib/ai/` Gemini · `lib/data/` UI data-access
(fixtures vs. live) · `messages/` FR/EN strings · `tests/` · `scripts/` · `docs/`.

## Notes

- Market data comes from Yahoo Finance through the unofficial `yahoo-finance2` library:
  delayed, may be incomplete or wrong, not for redistribution.
- The site is `noindex` and non-commercial.
- Charts use TradingView Lightweight Charts (attribution to be added in Step 3).
