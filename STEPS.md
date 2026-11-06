# STEPS.md: Step 4 (AI layer), split in three

Written 2026-11-06. Source: `PLAN.md` §11 Step 4 and §3.5, and `CURRENT.md`. `CURRENT.md` is stale on one point: Step 3b (dashboard) and the
market ticker are already built and committed, so **Step 4 is the next step**.

Step 4 as the plan words it: *Gemini client with model fallback chain; grounded prompt; schema-enforced JSON; per `(ticker, language, day)`
cache; `/api/ai/[symbol]`; company explainer + bull/bear/hold columns with the disclaimer.* Exit: the thesis for 3+ tickers is readable,
consistent with the on-page numbers, available in FR and EN, and still works (or degrades cleanly) when the quota is exhausted.

The split follows one dependency: **the Gemini key does not exist yet**, so everything that can be proven without it comes first.

| # | Part | Lead | Needs the user? | Status |
|---|---|---|---|---|
| 4a | **AI engine, offline** | orchestrator (data-engineer's area: `lib/ai`, `app/api`, `lib/contract`, `tests`) | No | **Done 2026-11-06** (see below) |
| 4b | **Live Gemini and quality** | orchestrator | **Yes: create the key** | Not started |
| 4c | **Thesis UI** | `frontend-engineer` | No (can start on fixtures before 4b) | Not started |

## 4a. AI engine, offline (no key needed)

Everything is built and tested against a **fake Gemini transport**, so the contract and behaviour are fixed before any real call.

- Contract **v0.4.0**, additive: `lib/contract/ai.ts` (`Thesis`, `ThesisResponse`, `AiLanguage`, `AiUnavailableReason`). Only the AI endpoint
  reports `0.4.0`; the market-data endpoints keep `0.3.1`.
- `lib/ai/config.ts`: model names in ONE place (primary `gemini-3.6-flash`, then `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`), timeouts, TTLs.
- `lib/ai/facts.ts`: turns a `StockSnapshot` into a **fact sheet with stable metric IDs** (`pe_trailing`, `market_cap`, ...). The model only ever
  sees these facts.
- `lib/ai/prompt.ts`: grounded prompt, third-party text (company name, business summary) delimited and declared as data, FR glossary vocabulary.
- `lib/ai/schema.ts`: the response JSON schema sent to Gemini plus the zod validator.
- `lib/ai/integrity.ts`: the model writes `{{metric_id}}` placeholders, the server renders the numbers; unknown IDs or stray numbers reject the
  generation. Output is plain text only.
- `lib/ai/gemini.ts`: REST client over an injectable `fetch` (no new dependency), fallback chain, quota/rate (429) and timeout handling.
- `lib/ai/service.ts`: cache per `(symbol, language, day)` with the existing lock/stale machinery (15 students = one generation), the
  "unavailable" outcomes (`no_key`, `quota`, `model_error`, `not_applicable`).
- `app/api/ai/[symbol]/route.ts?lang=fr|en` with its own, tighter rate-limit bucket (the endpoint must not be an open quota burner).
- `/api/health` reports Gemini.
- Tests: prompt/facts/integrity units, client fallback and quota paths, cold start (15 parallel requests = one Gemini call), route tests.

**Exit:** `npm run check` green; with no key the route answers a clean `ai_unavailable` instead of an error.

## 4b. Live Gemini and quality (needs the user)

1. **You** create the key in Google AI Studio and put it in `.env.local` (`GEMINI_API_KEY=`) and on Vercel (`vercel env add GEMINI_API_KEY`).
   Note the real RPM and RPD shown in AI Studio.
2. Record those limits in `PLAN.md` §3.5 and set the daily budget guard in `lib/ai/config.ts`.
3. Run the engine live on AAPL, MC.PA, 7203.T, TSM (currency mismatch) and SPY (ETF), in FR and EN. Fix whatever the integrity check rejects
   (prompt wording, schema), and confirm every number in the text matches the page.
4. Exhaust the quota on purpose (or simulate a 429 live) and confirm the degraded state.
5. Pre-warm script for the curated "start here" tickers (run before class).
6. Redeploy and check `/api/health` shows Gemini `ok`.

**Exit:** the thesis for 3+ tickers is readable and consistent with the page in FR and EN; real RPD is in the plan; the quota-exhausted path
degrades cleanly. **The professor reviews the French output of the first batch** (plan §3.5).

## 4c. Thesis UI (`frontend-engineer`)

- `lib/data` hook for `/api/ai/[symbol]` with a fixtures twin (so it can start before 4b).
- Stock page sections: "The company in 30 seconds", bull / bear / hold columns (arguments to evaluate, never advice), key risks, what to
  watch; persistent "Educational content, not financial advice" notice.
- Plain-text rendering only (no HTML or markdown). Loading skeleton, "AI unavailable" and "daily limit reached" states, a stale badge.
- FR/EN strings in `messages/`, mobile first (390 px), dark mode, UI tests, then an `apple-ui` polish pass.

**Exit:** a student reads the explainer and the three columns on a phone in FR and EN, including on a sparse-data ticker and on an ETF
(where the AI section says it does not apply), with no broken card when the AI is down.
