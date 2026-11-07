# STEPS.md: Step 4 (AI layer), split in three

Written 2026-11-06. Source: `PLAN.md` §11 Step 4 and §3.5, and `CURRENT.md`. `CURRENT.md` is stale on one point: Step 3b (dashboard) and the
market ticker are already built and committed, so **Step 4 is the next step**.

Step 4 as the plan words it: _Gemini client with model fallback chain; grounded prompt; schema-enforced JSON; per `(ticker, language, day)`
cache; `/api/ai/[symbol]`; company explainer + bull/bear/hold columns with the disclaimer._ Exit: the thesis for 3+ tickers is readable,
consistent with the on-page numbers, available in FR and EN, and still works (or degrades cleanly) when the quota is exhausted.

The split follows one dependency: **the Gemini key does not exist yet**, so everything that can be proven without it comes first.

| #   | Part                        | Lead                                                                              | Needs the user?                      | Status                          |
| --- | --------------------------- | --------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------- |
| 4a  | **AI engine, offline**      | orchestrator (data-engineer's area: `lib/ai`, `app/api`, `lib/contract`, `tests`) | No                                   | **Done 2026-11-06** (see below) |
| 4b  | **Live Gemini and quality** | orchestrator                                                                      | Keys added (Gemini, Groq)            | **Done 2026-11-07** (see below) |
| 4c  | **Thesis UI**               | `frontend-engineer`                                                               | No (can start on fixtures before 4b) | **Done** (`5e65608`)            |

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

## 4b status (2026-11-06)

Done: keys work; the engine runs live in FR and EN on AAPL, MC.PA, 7203.T; fixes found live (`thinkingLevel: low`, metric ids written as words
now refused, no digits in the FR vocabulary, dates are placeholders too, glossary list trimmed to six); real limits recorded in PLAN §3.5
(`gemini-3.6-flash` = 20 requests/day on the free tier); **multi-provider chain** (Gemini API, Groq, Gemma) with per-model quota memory;
one-generation chain test passed (3.6-flash 429, Groq answered). `scripts/ai-live.ts` is the opt-in live check (spends quota: use sparingly).
Tests: 515 green, all with fake transports.

Still open: live TSM (currency mismatch) FR and EN; the all-providers-exhausted path against the real APIs (covered by unit tests only);
the pre-warm script for the "start here" tickers; `GEMINI_API_KEY` and `GROQ_API_KEY` on Vercel, redeploy, `/api/health` check; the
professor's review of the French output. `dailyGenerationBudget` is 150 (Groq adds ~1000/day per model; spent models are skipped).

## 4b close-out (2026-11-07)

- Keys: `GEMINI_API_KEY` and `GROQ_API_KEY` are on Vercel (Production). `/api/health` on https://stocks-lens.vercel.app: Gemini `ok`.
- Live TSM (currency mismatch) checked in FR and EN on production: both `ready`, integrity gate passed. FR answered by `groq:openai/gpt-oss-120b`,
  EN by `gemini-3.6-flash`. EN cites the target as `$586.69` and free cash flow as `NT$476.57B`, so the two currencies are kept apart.
  Cosmetic: one EN bullet starts in lowercase (`profitability is ...`), a model quirk, not worth a rule.
- All-providers-exhausted path: **not** exhausted against the real APIs on purpose (it would burn the day's quota); it stays covered by the
  unit tests and by the UI "unavailable" states from 4c.
- Pre-warm script exists (`npm run ai:prewarm`, default base now the production URL, default tickers AAPL MSFT NVDA TSLA MC.PA 7203.T).
  **Not run**: it spends quota, and the curated "start here" list (PLAN §10 question 3) is still the user's to give. Run it before class.
- Still the user's: the professor's review of the French output, Upstash (health stays `degraded` until then), `Assets/` and `next-env.d.ts`.

## Handoff for 4c (written 2026-11-06, end of the 4b session)

- 4a and 4b are committed (`1eee34e`, local only, **not pushed**) and deployed. **Production is https://stocks-lens.vercel.app** (the old
  `stocklens-beryl.vercel.app` alias redirects there). Deploy by hand: `vercel deploy --prod --yes`.
- The endpoint the UI consumes: `GET /api/ai/{SYMBOL}?lang=fr|en` (contract v0.4.0, `lib/contract/ai.ts`: `ThesisResponse`). It needs an
  `Origin`/`Referer` of the site (same-origin from the browser is fine). Result is `ready` (with `thesis`, `meta.stale`) or `unavailable` with
  `reason` in `no_key | quota_exhausted | model_error | not_applicable_for_type | insufficient_data` (+ optional `retryAfter` seconds).
- Numbers inside the text are already rendered by the server; the UI shows plain text only (no HTML or markdown).
- Typical latency is 2-13 s on a cold generation, instant when cached, so the UI needs a loading state that does not block the page.
- **Do not spend AI quota while building the UI.** Build against fixtures (a fixtures twin of the AI hook, like the stock data). Gemini 3.6 flash
  allows only 20 requests a day; the user asked to keep live calls to a minimum. One live check at the end is enough.
- Still open from 4b: Upstash not provisioned (health `degraded`, per-instance cache), live TSM check, professor review of the French,
  curated "start here" tickers (PLAN §10), `Assets/` changes and `next-env.d.ts` are the user's and must not be committed without asking.
- Glossary term ids come back in `thesis.glossaryTerms`; the glossary itself is Step 5 (render them as plain chips or skip until then).
