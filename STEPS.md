# STEPS.md: Step 4 (AI layer, done) and Step 5 (education and teacher features, in progress)

Step 5 is at the bottom of this file. Step 4 was written 2026-11-06. Source: `PLAN.md` §11 Step 4 and §3.5, and `CURRENT.md`. `CURRENT.md` is stale on one point: Step 3b (dashboard) and the
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

---

# Step 5: education and teacher features (started 2026-11-07)

Source: `PLAN.md` §5 (education layer), §6 (teacher mode), §11 Step 5, tiers in §11 "Schedule". Baseline when started: `main` at `a7f32d3`,
`npm run check` green (566 tests). Lead: `frontend-engineer`, sequential (all parts touch `messages/*.json`, so no parallel worktrees).
No new contract version and no `data-engineer` work: everything is client-side or static content.

Plan wording: _Glossary + tooltips + "explain this metric" in lecture voice; "Séance N" tags; rule-based quiz cards; margin-of-safety card;
watchlist, notes and one-page thesis export; teacher links (`?tickers=…&hideAI=1`)._ Exit: **the professor reviews all FR/EN educational copy;
a teacher link works end to end.**

Already in place (do not rebuild): watchlist star + dashboard tile + recents (`lib/data/local`), per-card "explain" toggle with
definition/formula/rule for the 6 key cards (`Stock.cards.*`), `?hideAI=1` already honoured by the stock page (`components/stock/ai-flag.ts`),
`GlossaryTermId` (13 ids) in `lib/contract/ai.ts` with the thesis rendering them as plain chips, a static `LearnTile` placeholder on the home page.

| #   | Part                                  | Tier | Status          |
| --- | ------------------------------------- | ---- | --------------- |
| 5a  | **Glossary and Séance tags**          | P1   | Done 2026-11-07 |
| 5b  | **Notes, your pick, teacher links**   | P1   | Done 2026-11-07 |
| 5c  | **Quiz, margin of safety, export**    | P2   | Done 2026-11-07 |
| 5d  | **Polish pass and professor review**  | P1   | Waiting on the professor |

## 5a. Glossary and Séance tags

- Source of truth for wording: the lecture PDFs in `Lectures/` (local only, never committed, never quoted at length). Aziz's café voice,
  BPA/EPS, capitalisation boursière, DPR vocabulary. Séance numbers: last year's lectures 1 to 4, this year's file is three sessions.
- `lib/education/glossary.ts`: typed entries for the 13 `GlossaryTermId`s plus the terms the 6 cards use, each with FR and EN `short`,
  `definition`, `formula` (when it has one), `example`, `ruleOfThumb` (labelled as such) and a `seance` tag. Copy lives with the data, not in `messages/`.
- `/[locale]/learn`: the glossary page (search box, alphabetical, anchors `#eps`), linked from the header nav.
- Thesis glossary chips link to the term; metric "explain" panels get a "Read more" link and a Séance tag.
- Home `LearnTile`: real "term of the day" (deterministic by date), links to `/learn`.
- Tests: every id has FR and EN, no empty field, no digits-as-advice wording ("buy", "acheter" in imperative), term-of-the-day is stable per day.

## 5b. Notes, your pick, teacher links

- "Your turn" box on the stock page: notes (localStorage per symbol, try/catch, works without storage) and a Buy/Hold/Sell pick framed as
  _your argument_, never advice; the circle-of-competence prompt ("Can you explain this business to a 10-year-old?").
- Teacher links: `/[locale]/class?tickers=KO,NVDA,MC.PA&hideAI=1&title=…` shows the curated list as cards; `hideAI` is carried to every stock link
  from that page. Validation: max 12 symbols, symbol regex as in `lib/data/local/lists.ts`, title clipped, everything rendered as plain text.
- A small "Make a class link" builder (pick tickers, toggle hide-AI, copy the URL). No login, no storage on the server.
- Dashboard "This week's assignment" tile (tile 10) reads the last opened class link from localStorage.

## 5c. Quiz, margin of safety, export (P2, cut first)

- Rule-based quiz cards on the stock page (deterministic from the snapshot, e.g. P/E vs growth, EPS beat or miss), about 10 rules, immediate explanation.
- Margin-of-safety card: the student types their own value estimate, sees the gap against the price (Séance 4).
- One-page thesis export: print stylesheet plus copy-as-text of notes, pick and key numbers.

## 5d. Close-out

`apple-ui` polish pass (light and dark, 390 and 1280 px), `npm run check`, build, deploy, then **the professor reviews every FR/EN string**
(list them in one place: `lib/education/*` and the new `messages` namespaces).

## 5a status (2026-11-07)

Done, uncommitted: `lib/education/glossary.ts` (19 terms FR/EN: the 13 contract ids, `revenue`, and 5 extras `dcf`, `intrinsic_value`, `ticker`,
`hindsight_bias`, `opportunity_cost`), `/[locale]/learn` with search and anchors, "Learn" nav link, thesis chips and Explain panels link to the
glossary, real term of the day on the home tile. 745 tests green, build green, checked at 390 and 1280 px by the agent.
Decisions taken: "Accueil" stays hidden on phones on non-home pages (header overflowed at 390 px with the new link); the 5 extra terms stay, the professor can trim.
**For the professor:** all of `lib/education/glossary.ts`; six terms have no Séance (`forward_pe`, `dividend_yield`, `operating_margin`,
`revenue_growth`, `analyst_target`, `beta`: the lectures do not teach them, assign or confirm); FR "Taux de distribution (DPR)" is the agent's wording;
English says "Session N" for Séance. Known overlap: `Stock.cards.*` and the glossary repeat definition/formula/rule and can drift.

## 5b status (2026-11-07)

Done, uncommitted: "Your turn" box (`components/stock/your-turn.tsx`: notes up to 2000 chars, Buy/Hold/Sell pick framed as the student's own conclusion,
circle-of-competence prompt, storage in `lib/data/local/notes.ts`, works without storage), `/[locale]/class` (parsing and validation in
`lib/education/class-link.ts`, max 12 symbols, title clipped to 80 and rendered as text, `hideAI` carried to stock links), the link builder,
dashboard tile 10 (last opened class link, `lib/data/local/class-link.ts`), footer link "Class links, for teachers". 802 tests green, build green.
Decisions taken: the footer link is the entry point for now (no header entry); pick labels stay Buy/Hold/Sell (Acheter / Conserver / Vendre), as PLAN §2 decided.
**For the professor:** `Turn.*`, `Class.*`, `Class.builder.*`, `Dash.assignment.*`, `Footer.class` in `messages/*.json`. FR wording that is the agent's:
"À vous de jouer", "Où vos arguments vous mènent-ils aujourd'hui ?", "Liste de la classe", "Créer un lien de classe".
Known limits: a class link embeds the locale of the teacher who made it; `hideAI` only applies to links from the class page (not header search or watchlist).

## 5c status (2026-11-07)

Done: 11 rule-based quiz questions (`lib/education/quiz.ts`, none for ETFs or when data is missing or currencies do not compare), margin-of-safety card
(`lib/education/margin-of-safety.ts`; margin = (estimate - price) / estimate, estimate saved in the notes store), one-page export (print / PDF and
copy as text, `lib/education/export.ts`; works with `?hideAI=1`). 906 tests green, build green. Steps 5a, 5b and 5c are committed and deployed together.
**For the professor (5d):** `Quiz.rules.*`, `Safety.*`, `Export.*` in `messages/*.json` (all FR wording is the agent's); confirm the lecture's definition of
margin of safety; trim or keep the 11 rules; confirm the rule-of-thumb thresholds (P/E 25 / 12, payout 35 / 70 %, market-cap buckets 10 / 200 bn, target "about the same" = 2 %).
Known limits: a long note or the AI text can spill the export to a second page on other paper sizes; margin card shows two percentages (on the estimate and on the price);
SHEL.L (pence case) is not wired into `lib/data/fixtures.ts`, so it is covered by unit tests only.

## What is left of Step 5

Only 5d: the professor's review of all FR/EN copy (`lib/education/glossary.ts`, `lib/education/quiz` strings, the `messages/*.json` namespaces `Learn`, `Turn`, `Class`,
`Quiz`, `Safety`, `Export`, `Dash.learn`, `Dash.assignment`), the six glossary terms with no Séance, and a short apple-ui polish of the long stock page on phones
(idea: fold quiz and margin cards into `details`). Then Step 6 (hardening, QA, launch).

---

# Step 6: hardening, QA and launch (started 2026-11-07)

Source: `PLAN.md` §11 Step 6 and §8 "Definition of done". Baseline: `main` at `dcc8076`, 906 tests green. Lead: orchestrator, agents only on fixes
and only when the user says go. Exit: v1 definition of done, **class dry run with 15 simultaneous tabs** (no 429s, AI quota survives),
soak verdict "pass", Privacy/Terms signed off by the professor, link ready to share.

| #   | Part                                  | Needs the user?                          | Status      |
| --- | ------------------------------------- | ---------------------------------------- | ----------- |
| 6a  | **Soak verdict and ops sanity**       | Final call on deleting spike + workflow  | In progress |
| 6b  | **Resilience audit (stale mode)**     | No                                       | Partly: prod burst OK, see below |
| 6c  | **Ticker test matrix**                | No                                       | Not started |
| 6d  | **Accessibility and Lighthouse**      | No                                       | Done 2026-11-07 (see below) |
| 6e  | **About / Privacy / Terms and README**| Professor signs the wording              | Page drafted, README not yet |
| 6f  | **Code review and final polish**      | No                                       | Not started |
| 6g  | **Deploy and class dry run**          | Upstash, "start here" list, go to deploy | Not started |

## 6a. Soak verdict (finding, 2026-11-07)

The GitHub soak was **invalid**: 6 of 7 runs failed with HTTP 307 because the workflow still called the old `stocklens-beryl` alias, which now redirects
to `stocks-lens`. The only run that measured Yahoo was the first manual dispatch (success). GitHub's scheduler also fires a `*/5` cron only every ~6 hours.
Fix applied: URL now `stocks-lens`, one run loops 10 ticks x 3 tickers over ~50 minutes and prints `SOAK total=… non200=…`, cron every 30 minutes.
Verified by hand: `/api/spike` answers 200 for AAPL, MC.PA and 7203.T on production. Verdict = read the `SOAK total` lines after a few runs
(pass = under 2 % non-200). Plan B is PLAN §3.6.

## 6b to 6e status (2026-11-07, uncommitted, not yet deployed)

- **Burst test on production** (read-only, no AI): 15 parallel `/api/stock` requests for KO and for NVDA, plus chart, search, quotes, market, ticker, SPY, TSM: all 200,
  0.4 to 1.7 s; unknown ticker gives a clean 404. This does **not** prove "one upstream fetch" across instances: that needs Upstash (health says `degraded`).
  Stale mode already exists (provider cache with stale copy, `stale` flags in the contract and the UI), still to be exercised against a forced Yahoo failure.
- **Lighthouse (mobile, production)**: home, AAPL stock page, glossary, About. Accessibility 100 and best-practices 100 everywhere, performance 90 to 100
  (stock page LCP 3.4 s is the weakest), CLS 0. SEO 60 is the intentional `noindex`. One real finding fixed: WCAG 2.5.3 label-in-name on the language
  switcher ("FR, Français") and the chart range pills ("1H, 1 heure"); `components/locale-switcher.tsx` and `components/stock/chart-panel.tsx`.
- **About, Privacy and Terms** written in FR and EN (`About.*` in `messages/*.json`, `app/[locale]/about/page.tsx`): audience, advice, data, AI, browser storage
  (the exact localStorage keys), cookies, server, terms. It carries a visible "draft, to be signed off by the professor" line; **remove that line only after the
  professor signs.** The old `About.draft` key was renamed `About.credits`. Facts the professor should confirm: adults 18+, outside EEA/CH/UK; no contact address
  is invented (it says "your professor or the club organiser").
- Still open in 6e: README is stale ("Step 1 in progress"), to rewrite at close-out.
- Not done yet: 6c ticker matrix against the live site (US, EU, Asia, ETF, loss-maker, semi-annual, bank), forced-failure test of stale mode, `/code-review`,
  final apple-ui pass, and 6g (needs Upstash and the "start here" list from the user).
