# StockLens

A free, bilingual (FR / EN), beginner-friendly web app that helps students understand any listed
company: a price chart, key numbers next to analyst expectations, analyst sentiment, and an AI-written
plain-language explanation with a bull / bear / hold set of arguments. Built for a high-school
investment club.

**Educational content, not financial advice.** StockLens is not a broker, places no orders and holds no
money. Buy / Hold / Sell appear only as arguments for the student to weigh.

- Live site: <https://stocks-lens.vercel.app> (Vercel Hobby, region `cdg1`)
- Plan and decisions: [`PLAN.md`](./PLAN.md) · step-by-step status: [`STEPS.md`](./STEPS.md) · where we are now: [`CURRENT.md`](./CURRENT.md)
- Design rules: [`docs/design-notes.md`](./docs/design-notes.md) · which fields exist per kind of ticker: [`docs/data-availability.md`](./docs/data-availability.md)

## What it does

- **Home dashboard:** search with autocomplete, market band and index strip, watchlist and recently viewed
  (in the browser), a "start here" list of companies with one line on why each is worth a look, upcoming
  earnings, a term of the day, and the current class assignment.
- **Stock page:** price and delay, a chart with 8 ranges (1H to All), six key-number cards (EPS vs. expected,
  P/E, revenue, operating profit, free cash flow, market cap) plus dividends, analyst ratings and price targets,
  the AI explainer with bull / bear / hold columns, notes and a Buy / Hold / Sell pick, quiz questions,
  a margin-of-safety calculator, and a one-page export (print or copy).
- **Learn:** a glossary in the voice of the club's lectures, with "Séance" tags and a rule of thumb per term.
- **Teacher links:** `/{locale}/class?tickers=KO,NVDA,MC.PA&hideAI=1&title=...` shares a curated list, and can
  hide the AI text for exercises where students analyse first. No login, nothing stored on the server.
- **Honest about gaps:** every number is optional. A missing value shows a labelled "not available" reason
  (ETF, loss-maker, semi-annual reporter, currency mismatch...), never a blank or `NaN`. When Yahoo fails, the
  last saved data is shown with a visible banner.

## How it works

```
Browser ──► Next.js route handlers (/api/*) ──► Upstash Redis (cache, stale copy, lock, rate limit)
                                          ├──► Yahoo Finance via yahoo-finance2   (market data)
                                          └──► Gemini, Groq (model fallback chain) (AI thesis)
```

- The browser never calls Yahoo or an AI provider. Provider and AI modules are `server-only`; the shared
  data contract in `lib/contract/` is types only and versioned (market data `0.3.1`, AI endpoint `0.4.0`).
- Every Yahoo payload is validated with zod and normalised into our own types, so a change on Yahoo's side
  degrades one card, not a route.
- **Caching:** fresh for 30 s to 12 h depending on the data, with a long-lived stale copy served (flagged
  `stale`) when Yahoo fails. A lock makes 15 students opening the same ticker cause one upstream fetch.
- **AI:** the model sees only a fact sheet built from the data already on the page and writes `{{metric_id}}`
  placeholders; the server renders the numbers and rejects any text with a stray number. Output is plain text.
  Free-tier quotas are small, so one generation is cached per ticker, language and day, and spent models are skipped.
- Details and the reasons behind each choice are in [`PLAN.md`](./PLAN.md) (§3 technology, §7 architecture).

## Develop

Requires Node 22+ (developed on 24). Next.js here is version 16, which differs from older releases: read
`node_modules/next/dist/docs/` before changing Next-specific code (see `AGENTS.md`).

```bash
npm ci
cp .env.example .env.local     # nothing is required to run in fixtures mode
npm run dev                    # http://localhost:3000 (redirects to /fr)
npm run check                  # typecheck + lint + tests (what CI runs, plus the build)
```

`NEXT_PUBLIC_DATA_MODE=fixtures` (the default) runs the UI on recorded payloads with no network. Set it to
`live` to use the real `/api/*` routes, which call Yahoo (and need AI keys for the thesis).

### Environment variables

Set them in `.env.local` locally (git-ignored) and as project variables on Vercel. Never commit real values.

| Variable                                             | Purpose                                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_DATA_MODE`                              | `fixtures` (default) or `live`. Must be `live` in production; it is read at build time                        |
| `GEMINI_API_KEY`, `GROQ_API_KEY`                     | AI providers (both free tier, each optional: a missing key leaves that provider out)                          |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Shared cache. The Vercel Marketplace names `KV_REST_API_URL` / `KV_REST_API_TOKEN` are also accepted          |
| `ALLOWED_ORIGINS`                                    | Extra hosts allowed by the API's Origin/Referer check (the site's own host is always allowed)                 |
| `CLUB_CODE`                                          | **Leave empty.** The code gate has no entry page in the UI yet: setting it makes every `/api` call answer 401 |

Without the Upstash variables the cache is in memory: fine locally, but on Vercel it is per instance and
`/api/health` reports it as `degraded`.

### Scripts

| Script                                       | What it does                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `npm run check`                              | Typecheck, lint and all tests                                                                          |
| `npm test` / `npm run test:watch`            | Vitest. Every test uses fake transports: nothing touches the network or spends AI quota                |
| `npm run fixtures:record` / `fixtures:build` | Re-record raw Yahoo payloads (manual, rate-limited) and rebuild the contract-shaped fixtures           |
| `npx tsx scripts/smoke.ts --base <url>`      | Live smoke test over HTTP: 8 tickers, all chart ranges, dashboard endpoints. Exits 1 on a hard failure |
| `npm run ai:prewarm`                         | Generate the AI thesis for the start-here tickers before class. **Spends AI quota**                    |
| `npm run ai:live`                            | Opt-in live check of the AI chain. **Spends AI quota**, use sparingly                                  |
| `node scripts/outage-proxy.mjs`              | Outage drill: a switchable proxy to watch the stale mode when Yahoo stops answering                    |

## Layout

`app/` routes and pages · `components/` UI · `lib/contract/` shared types (versioned) · `lib/providers/` market data
(server-only) · `lib/ai/` AI chain, prompt, integrity check · `lib/data/` UI data access (fixtures vs. live) ·
`lib/education/` glossary, quiz, class links, start-here list · `messages/` FR/EN strings · `tests/` · `scripts/` · `docs/`.

## Deploy and operate

- CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests and the build on every push and pull request.
- A weekly workflow (`.github/workflows/smoke.yml`, Mondays 06:00 UTC, also runnable by hand) runs the live smoke test against
  production, so a broken Yahoo or a bad deploy shows up before class. It spends no AI quota.
- Vercel auto-deploy from GitHub is **not** connected: deploy by hand with `vercel deploy --prod --yes`.
- `GET /api/health` reports Yahoo, the cache and the AI providers (no secrets). Use it before class.
- Before a class: check `/api/health`, run `npm run ai:prewarm`, and open a few tickers.

## Notes

- Market data comes from Yahoo Finance through the unofficial `yahoo-finance2` library: delayed, possibly
  incomplete or wrong, not for redistribution. The site is `noindex` and non-commercial, with no ads and no analytics.
- AI text comes from free-tier models and only from public market data; no student data is ever sent to them.
  The intended audience is adults outside the EEA, Switzerland and the UK (Google's free-tier terms; see `PLAN.md` §3.5).
- Students' notes, picks and watchlists live in their own browser (`localStorage`). The About page lists exactly what is stored.
- Charts use [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts) (Apache-2.0); the
  required attribution and notice are on the About page and in the chart.
- **No licence file yet.** Until one is added, the code is all rights reserved by default. Choosing a licence and
  confirming the logo's ownership are still open (`PLAN.md` §10, question 10).
