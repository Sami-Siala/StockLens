# StockLens — Project Plan

> Status: **DRAFT v4** (v2 added the 6-step plan §11 and agents §12; v3 applied the independent plan review; **v4 adds the home dashboard (§4.3, Step 3b) and Phase 2 accounts, groups & paper trading (§13)**) — 2026-11-05. Written after a scoping Q&A and a technical spike (see §3.3).
> Items marked ⚠️ are risks or things still to confirm; items marked ❓ are open questions for you.

## 1. Vision

A free, beginner-friendly, modern web app where a high-school student can look up any major listed company in the world and understand it: price chart, a handful of key financials compared to analyst expectations, analyst sentiment, and an AI-written plain-language explanation with a simple bull / bear / hold thesis, so they can form their own opinion.

**Primary goal: education.** Every number on screen should be explainable at the level of the PMF Investment Society lectures (EPS, P/E, market cap, DPR, DCF, margin of safety, circle of competence), with room to go slightly beyond (FCF, operating margin, forward P/E, analyst targets).

**Audience:** about 15 students (the club). This keeps us comfortably inside every free tier.

**Hard constraint: $0.** Data, AI, hosting and domain must all be free.

## 2. Decisions so far

| Topic | Decision |
|---|---|
| Data | **Yahoo Finance via `yahoo-finance2`**, behind a server-side cache, with a stale cache + snapshot file as the real degraded mode; optional **US-only** quote fallback via Finnhub / Twelve Data free keys (to be tested in Step 1). SEC EDGAR is **dropped from v1** (heavy XBRL mapping, US-only, no analyst data) |
| Language | **Bilingual FR / EN** toggle (UI and AI output). i18n from day one |
| AI thesis flow | **Shown immediately** on the stock page (bull / bear / hold). No "write yours first" gate (a teacher-mode toggle can hide it, see §6) |
| Persistence | **v1 (first class): no accounts.** Watchlist and notes in browser `localStorage`, with copy/export. **Phase 2 (after launch): accounts, groups and paper trading, see §13** (this deliberately changes the privacy, hosting and security posture, so it ships as its own release) |
| Home page | A **dashboard**, not just a search bar: market snapshot, watchlist with sparklines, curated starters, movers, earnings, sectors, learning strip (§4.3, **Step 3b**, tier P1) |
| Paper trading (Phase 2) | Virtual wallets for students **and groups**, in teams via `@handle` or a unique invite link; the **professor sets the rules** (starting cash, allowed asset classes, leverage, position limits, per-lesson assignments). Virtual money only, no real orders (§13) |
| Audience | ~15 students |
| Scope | **Stocks first**; macro/bonds page is phase 2 |
| Learning features | Metric tooltips + "explain this metric", **teacher mode**, **quiz / "test yourself"** prompts |
| Repo | GitHub, **public** (so: no secrets, no copyrighted lecture PDFs committed, see §9) |
| Audience age & region | Students are **adults (18+) and live outside the EEA, Switzerland and the UK** (stated by the professor). This is what makes Gemini's free-tier terms usable (§3.5). If the audience ever changes, the AI plan must be revisited |
| Shared store | **Upstash Redis is in v1** (cache + stale copy, request lock, Yahoo cookie, rate-limit counter), per the plan review (§3.1, §7) |
| Thesis labels | **Buy / Hold / Sell kept**, always framed as *arguments to evaluate*, never as advice |
| Schedule | **~2 weeks to first student use, full scope kept**, so delivery is staged by priority tier (§11) |
| Logo | `Assets/3f61d25b-…png`: black rounded wordmark, gradient orange→magenta→purple "o" with 3 bars |

## 3. Technology choices

### 3.1 Stack

- **Next.js (App Router) + TypeScript**, deployed on Vercel. Server route handlers give us a place to hide API keys and cache.
- **Tailwind CSS + shadcn/ui** for a polished, accessible UI quickly.
- **TradingView Lightweight Charts** (free, open source; its attribution requirement is easy to satisfy) for price charts. It handles area/candle, crosshair and range switching well. Fallback: Recharts for the small financial bar charts.
- **next-intl** for FR/EN.
- **Zod** to validate every external payload (Yahoo's shape changes; we never trust it blindly).
- **Upstash Redis (free tier, via Vercel Marketplace)**, **in from v1**. Serverless instances don't share memory and route handlers aren't cached by default, so without a shared store: (a) 15 students opening the same ticker in the same minute all hit Yahoo cold, (b) "serve last-known data when Yahoo fails" is impossible, (c) a per-IP limiter can't work. It holds: the data cache with a long-TTL stale copy, a short "generation in progress" lock (request coalescing), the AI cache, the persisted Yahoo cookie/crumb (re-fetching it on every cold start is a main trigger of 429s), and rate-limit counters.

### 3.2 Data: how we get each feature

| Feature you asked for | Source | Notes |
|---|---|---|
| Ticker search, any major exchange | `yf.search()` | Verified: "lvmh" → `MC.PA` (Paris) |
| Live price, day change | `yf.quote()` / `price` module | Delayed ~15 min on many exchanges; we poll (30–60 s), no websockets. Label it "delayed" honestly |
| Charts: 1H, 1D, 1W, 1M, 1Y, 3Y, 5Y, All | `yf.chart()` | Mapping in §3.4 |
| EPS (last quarter, actual vs expected) | `earningsHistory` | Verified AAPL: actual 2.10 vs est 1.986, surprise +5.75% |
| Trailing P/E, forward P/E | `summaryDetail`, `defaultKeyStatistics` | Forward P/E missing for some tickers (e.g. Toyota) → show "n/a" + tooltip why |
| Revenue, operating profit, free cash flow, net income | **`fundamentalsTimeSeries`** (quarterly + annual) | ⚠️ Yahoo broke the old `incomeStatementHistory` / `cashflowStatementHistory` modules in Nov 2024; use the time-series API |
| Market cap, shares, dividend, payout ratio | `summaryDetail`, `defaultKeyStatistics` | Ties directly to Lecture 3–4 (market cap, DPR) |
| Analyst sentiment (strong buy → strong sell counts) | `recommendationTrend` | Verified for AAPL and LVMH |
| Analyst price target (low / mean / high), # of analysts | `financialData` | Verified: AAPL mean 333, range 250–405, 38 analysts |
| Forward estimates (EPS/revenue next quarter / year) | `earningsTrend` | Used for "vs. analyst expectations" on the forward side |
| Company profile (sector, description, country) | `assetProfile` | Input to the AI prompt |
| Next earnings date | `calendarEvents` | Nice "what to watch" card |

⚠️ **Known gap:** Yahoo gives past **EPS** actual-vs-estimate, but **not** past **revenue** actual-vs-estimate. For revenue we'll show revenue trend (QoQ/YoY growth) plus *next* period's analyst revenue estimate. We will not fake a "revenue beat/miss" figure. ❓ Acceptable? (Alternatives: Finnhub free tier may offer revenue surprises for US stocks only; to be verified.)

⚠️ **Gaps by market:** Some companies report semi-annually (LVMH returned only 3 rows with partial fields) and some fields are missing outside the US. The UI must treat every metric as optional, with a clear "not available for this company" state, never a blank or a `NaN`.

⚠️ **More data-reality rules (from the plan review):**
- **Three currencies, not one.** Yahoo's price currency can differ from the **financial/reporting currency** (e.g. TSMC trades in USD, reports in TWD; many ADRs and cross-listings) and from the analyst-target currency. The contract carries `priceCurrency`, `financialCurrency` and `targetCurrency` plus a unit table (`GBp`, `ZAc`, `ILA`...). When units can't be reconciled, hide price-vs-target and P/E-derived cards instead of mixing currencies.
- **`quoteType` branching with reason codes:** ETFs, indices and crypto have no fundamentals (`not_applicable_for_type`); loss-makers have no trailing P/E (`negative_earnings`); banks, insurers and REITs often lack FCF/operating income (`not_reported`).
- **EPS-vs-expected may be blank** for many non-US names (`earningsHistory` is only the last ~4 quarters and often empty abroad). Tell the professor what blank cards to expect.
- **Delay:** use Yahoo's `exchangeDataDelayedBy` per exchange rather than a fixed "15 minutes".
- **Chart quirks:** `chart()` may require `period1`/`period2` instead of `range` (check the pinned version); drop null rows; Lightweight Charts needs strictly ascending, unique timestamps and has no timezone support (custom exchange-time label formatter); decide once between adjusted and unadjusted close.
- **yahoo-finance2 validates responses itself and throws on unexpected shapes.** Disable its validation (`validateResult: false` / equivalent) and rely on our own zod, so a new field degrades one card, not a route.
- **Step 2 deliverable: a data-availability matrix** (fields × `AAPL`, `MC.PA`, `7203.T`, `TSM`, a bank, an ETF, a loss-maker). We only build cards for fields that appear in most rows.

### 3.3 Spike results (2026-11-05, run from this machine)

- `yahoo-finance2` (it handles Yahoo's cookie/crumb): search, chart (weekly since 2020 on `MC.PA`), and 10 `quoteSummary` modules all returned data for **AAPL, MC.PA (Paris), 7203.T (Tokyo)**.
- Raw `curl` to Yahoo's endpoints got **HTTP 429** on the first call, so we must never call Yahoo from the browser or without the library, and the cache layer is non-negotiable.
- Stooq (a historical free CSV source) now sits behind a JS challenge, so it is **not** usable as a fallback.
- ⚠️ **Not yet tested: calls from Vercel's servers.** Shared datacenter IPs are the main throttling risk, and blocking is intermittent, so one successful call proves little. Step 1 starts a **multi-day soak test** (3–5 days, intended Vercel region, persisted cookie, explicit User-Agent, a request every few minutes for the 3 test tickers). **Pass = under 2% non-200 responses.** It runs in the background while Steps 2–3 proceed; the verdict is due before Step 3 closes.
- ⚠️ **Honest fallback picture:** for non-US tickers (LVMH, Toyota...) there is effectively **no free fallback provider**. The real degraded mode is the stale cache plus a **snapshot file** for the curated "start here" tickers (refreshed by a GitHub Action or from the teacher's machine).

### 3.4 Chart ranges → Yahoo parameters

| UI range | Yahoo `interval` / `range` | Notes |
|---|---|---|
| 1H | `1m` / `1d`, sliced to last 60 min | Yahoo only keeps 1m data for ~7 days. When the market is closed we show the **last trading hour** and say so |
| 1D | `5m` / `1d` | |
| 1W | `15m` / `5d` | |
| 1M | `1h` / `1mo` (or `1d`) | |
| 1Y | `1d` / `1y` | |
| 3Y | `1wk` / `3y` | |
| 5Y | `1wk` / `5y` | |
| All | `1mo` / `max` | |

Also: market-hours awareness and local currency + exchange timezone per ticker, because "any major ticker in the world" means EUR, JPY, GBp (pence!) and so on. Show the currency everywhere.

### 3.5 AI

- **Provider:** Google Gemini API, free tier. Per Google's pricing page (checked 2026-11-05), free-tier models include `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, plus `gemini-2.5-flash*` (older). Gemma 4 is also free.
- **Measured free-tier limits (2026-11-06, Step 4b):** `gemini-3.6-flash` = **20 requests per day** (quotaId `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, per project and per model); a 429 body names the limit and `retryDelay`. The two fallback models were not probed (probing spends them). Also seen: occasional 503 "high demand" on the primary, 2-13 s per thesis. Consequence: roughly 40-60 generations a day in total, so **pre-warm the "start here" tickers before class**; `dailyGenerationBudget` is 40 and the service remembers a spent model per day. Needs `thinkingLevel: low`, otherwise the thinking tokens cut the JSON off (`MAX_TOKENS`).
- **Provider chain (Step 4b, 2026-11-06):** Gemini API models, **Groq** (`GROQ_API_KEY`, free: 1000 requests/day per model, 8000 tokens/minute, `json_schema` works) and Gemma, in the order set in `lib/ai/config.ts`: `gemini-3.6-flash`, `groq:openai/gpt-oss-120b`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `groq:qwen/qwen3.8-27b`, `gemma-4-31b-it`. Each provider has its own quota, so a spent model is skipped and the next answers (verified live: 3.6-flash 429, Groq answered in ~4.6 s). Measured: `gpt-oss-120b` ~2 s and usually passes the integrity gate; `qwen3.8-27b` mixed; `gpt-oss-20b` failed (dropped); Gemma 30 s+ and flaky (last resort; the 26B model timed out). A missing key just leaves that provider out. We do not rotate several keys of one provider: quotas are per project and splitting across projects is against Google's terms.
- **Plan:** primary `gemini-3.6-flash` (best quality/speed that's free), fallback chain `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite`. ⚠️ Free model lists and quotas change often; exact RPM/RPD are shown only inside AI Studio, so we confirm them there when you create the key, and keep model names in one config file.
- ⚠️ **Google Search grounding is NOT free on Gemini 3+** (only older 2.5 Flash gets 500/day). So we do **not** rely on live web search. Instead we **ground the AI on the structured data we already fetched** (financials, estimates, analyst data, profile) and tell it to use only that plus well-established general knowledge. This also reduces hallucination and keeps the explanation consistent with the numbers on the page.
- **Output:** structured JSON (schema-enforced) with: `what_it_does` (explain like I'm 15), `how_it_makes_money`, `bull_case`, `bear_case`, `hold_case` (each 2–3 bullets that reference specific metrics shown on the page), `key_risks`, `what_to_watch`, and `glossary_terms_used`.
- **Cache & quota:** cache key `(ticker, language, data-hash or week)` in Upstash with a "generation in progress" lock, so 15 students opening the same ticker trigger **one** generation, not 15. Third-party reports say free-tier daily request limits were cut sharply in late 2025 and disagree on the number, and limits are per project, so **Step 1 records the real RPD/RPM from AI Studio and writes it here**. Fallback models usually have their own small quotas, so don't count on the chain alone. Pre-warm the teacher's curated tickers before class. The public `/api/ai/*` endpoint must not be an open quota-burner (see rate limiting, §7).
- **Numbers integrity:** the model cites **metric IDs** and the server renders the numbers into the text (placeholders like `{{pe_trailing}}`), or at minimum every number in the output is regex-checked against the supplied data and the generation is rejected on mismatch. "Cross-check where feasible" is not enough.
- **Untrusted text:** company names and `longBusinessSummary` are third-party text pasted into the prompt. Wrap them in clear delimiters, tell the model to treat them as data, and **render AI output as plain text** (never HTML/markdown). Pass the lecture glossary (BPA/EPS, capitalisation boursière, DPR...) so French output uses the course vocabulary, and have the professor review the French output for the first batch of tickers.
- **Safeguards:** a persistent "Educational content, not financial advice" notice; the AI never says "buy now"; the thesis frames Buy/Hold/Sell as *arguments to evaluate*; temperature kept low; numbers in the thesis are cross-checked against our data where feasible.
- **Gemini free-tier terms (verified 2026-11-05 on Google's terms page):** "You must be 18 years of age or older to use the APIs"; API clients "directed towards or … likely to be accessed by individuals under the age of 18" are not allowed; **only paid services** may be used for API clients available to users in the **EEA, Switzerland or the UK**; and on the unpaid tier Google may use submitted content and responses to improve its products, and human reviewers may read them. **We rely on the professor's statement that all students are adults living outside those regions.** Mitigations: no student data ever reaches Gemini (only public market data), the site is not indexed by search engines (`noindex`), and the About/Privacy page states the intended audience. If the audience changes, switch to pre-generated reviewed content or another provider.

### 3.6 Hosting (the Vercel question)

**Yes, Vercel Hobby works and is free.** Caveats:
- The Hobby plan is **non-commercial, personal use only**. A free school club app is fine as long as nobody is paid for it or it carries ads or sales. Grey zone: Vercel defines "commercial" as financial gain for anyone involved in production, so if the app were used as **paid** course material for a paid instructor, check Vercel's fair-use guidelines first (donations are allowed).
- Hobby limits (per Vercel docs, 2026): function max duration 300 s; usage caps are monthly and generous for 15 users.
- If Vercel's IPs get throttled by Yahoo: Cloudflare Workers and free-tier VMs are *also* datacenter IPs (and Oracle Always Free needs a card), so they are not independent fixes. **Plan B = the snapshot file for curated tickers (above) plus, if needed, a small proxy on a machine you control.** Not needed unless the soak test (§3.3) fails.
- Domain: free `*.vercel.app` URL (e.g. `stocklens.vercel.app` if available). A custom domain costs money, so skip it.

## 4. Product design

### 4.1 Pages

1. **Home = dashboard** (full spec in §4.3): search stays the hero, with a market snapshot, your watchlist, curated starters, movers, upcoming earnings, sector tiles and a learning strip under it. Logo-forward, calm, never more than ~8 tiles above the fold on a phone.
2. **Stock page** (the core), top to bottom:
   1. Header: name, ticker, exchange, currency, live price + change, "delayed" badge, ⭐ add to watchlist.
   2. **Chart** with the 8 range buttons, area/candle toggle.
   3. **"The company in 30 seconds"** (AI).
   4. **Key numbers** in 4 plain-language groups, each card = value + one-line meaning + "explain" tooltip:
      - *Price & size:* market cap, P/E (trailing), P/E (forward).
      - *Earnings:* EPS last quarter **vs. analysts' expectation** (beat/miss badge), next-earnings date.
      - *The business:* revenue (and growth), operating profit (and margin), free cash flow, net income.
      - *Shareholders:* dividend yield, payout ratio (DPR).
   5. **What analysts think:** buy/hold/sell stacked bar + price-target range bar with the current price marked.
   6. **Bull / Bear / Hold** three-column AI thesis, then "your turn": the student's own notes box (localStorage) and a Buy/Hold/Sell pick.
   7. **Test yourself** (quiz) card.
   8. Footer: data sources, delay notice, disclaimer, link to the bilingual **About / Privacy & Terms** page (what is stored locally, what the server logs, AI and delayed-data caveats, "educational, not advice, not a broker", intended audience; professor signs off) and the Lightweight Charts attribution/NOTICE.
3. **Compare** (stretch): two tickers side by side. Great for the "Maison Dorée vs NovaTech" style discussions.
4. **Learn / Glossary:** every term with definition, formula, example in the lectures' voice (the "café d'Aziz"), and "Séance N" tags.
5. **Teacher mode** (see §6).
6. **Macro (phase 2):** Fed rate, CPI, US10Y / FR10Y yields, USD index. FRED API is free with a key. Mirrors Séances 4 and the debt lecture.

### 4.2 Design principles
- Beginner first: progressive disclosure. The first screen shows 6–8 numbers, not 60.
- Every number has a **plain-language label**, a **tooltip**, and a **"good / typical / high" context** (e.g., P/E vs. a sector rule of thumb), clearly labelled as a rule of thumb.
- **Apple-HIG design language** (via the `apple-ui` skill, see §12): clarity, deference, depth. One 8 px spacing grid, one primary action per view, calm inline feedback, restraint over decoration.
- Brand: white/near-white canvas, black wordmark, neutral grays from tokens. The logo's **orange → magenta → purple gradient is the single accent**, used sparingly (primary button, active range pill, focus ring, brand marks), not as big decorative backgrounds. Sample exact hex values from the PNG in Step 1.
- Typography: the **system font stack** (SF on Apple devices, Segoe UI / Roboto elsewhere), no webfonts, max 3 weights, tabular figures for all prices. *(Changed from the earlier Nunito/Quicksand + Inter idea, to follow the apple-ui rules and save load time.)*
- Green/red for up/down must **also** use icons/arrows (colour-blind safe). Dark mode supported.
- Mobile-first: students will open this on phones.
- Skeleton loaders and graceful per-card errors: one failed Yahoo module never breaks the page.
- Logo: derive a square favicon/app icon from the gradient "o" mark, plus an SVG/WebP wordmark for fast loading. The original PNG is ~150 KB on a white background, so we'll cut a transparent version (⚠️ may need a re-export from you if a clean cutout isn't possible).

### 4.3 Home dashboard (Step 3b, tier P1)

Today the home page is a logo and a search box. The dashboard makes it worth opening every day, while keeping the beginner-first rule (progressive disclosure: a handful of tiles, each with a one-line "what am I looking at").

| # | Tile | Content | Data source / notes |
|---|---|---|---|
| 1 | **Search** (hero) | Autocomplete as today, plus recent searches | `/api/search` |
| 2 | **Markets now** | Open/closed chips for NYSE/Nasdaq, Euronext Paris, Tokyo, plus an index strip: S&P 500, Nasdaq, CAC 40, Euro Stoxx 50, Nikkei 225, EUR/USD, gold, 10-year US yield, each with level, day change (arrow, not colour alone) and a tiny sparkline | new `/api/market` (one cached batch, ~60 s). Symbols `^GSPC ^IXIC ^FCHI ^STOXX50E ^N225 EURUSD=X GC=F ^TNX` to verify against Yahoo in Step 3b |
| 3 | **My watchlist** | Starred companies with price, day change, sparkline and a "reports on <date>" chip. Empty state: "Star a company to follow it here" | `localStorage` list (v1) → `/api/quotes?symbols=` batch. Moves to the account in Phase 2 |
| 4 | **Recently viewed** | Last ~6 companies | `localStorage` |
| 5 | **Start here** | The professor's curated companies, each with one line on *why* ("a company you can explain to a 10-year-old", linked to a Séance) | curated list in `lib/education/` (needs your 8–10 tickers, §10 Q3) |
| 6 | **Today's movers** | Biggest gainers/losers **within the curated + watchlist universe** (not the whole market) | computed from the batch quotes; avoids depending on Yahoo's screener endpoints (unverified, possibly restricted). P2 inside the dashboard |
| 7 | **Earnings this week** | Who reports soon among curated + watchlist, with the "EPS vs expected" explainer link | `calendarEvents`, 12 h cache. Drops dates older than 2 days (finding 3) |
| 8 | **Sectors** | 11 sector tiles (US sector ETFs, `XLK XLF XLE XLV XLY XLP XLI XLB XLU XLRE XLC`) coloured by day change, with arrows | same batch as tile 2. P2 inside the dashboard |
| 9 | **Learn** | Term of the day (from the glossary), a quiz teaser, "Séance N" shortcuts | Step 5 content; static placeholder until then |
| 10 | **This week's assignment** | Card showing the teacher's current link/assignment (v1: a `?tickers=` class link; Phase 2: real assignments, §13) | teacher links (§6) |

Rules for the dashboard:
- **Cheap on Yahoo.** Every tile reads the shared Upstash cache; one upstream refresh per ~60 s for the whole class, never per student. Batch quotes in one call (`quote()` takes an array), sparklines from the cheapest chart interval, thinned to ~30 points. **Verify in Step 3b** the call count per dashboard load and the 15-tabs cold-start behaviour.
- **Independent tiles.** Each tile has its own skeleton and error state; one failed tile never blanks the page.
- **Polite refresh.** At most every 60 s, paused when the tab is hidden, off with reduced motion.
- **Honest labels.** "Delayed" badge per exchange, local currency, no invented numbers, and an "unofficial data" footer.
- **Phone first.** Tiles stack in one column at 390 px, 2 to 3 columns at 1280 px; tokens and the single gradient accent as everywhere else.
- **Contract:** additive v0.3.0, e.g. `MarketOverview` and a light `QuoteLite` (price, change, currency, delay, sparkline). Owner: `data-engineer`; the UI is `frontend-engineer`'s.

## 5. Education layer (maps to your lectures)

| Lecture concept | Where it appears in the app |
|---|---|
| EPS / BPA (S2–3) | EPS card + formula tooltip "profit ÷ number of shares" |
| P/E (S2–3) | P/E card, "years of profit to earn your money back" tooltip (Aziz's café), forward vs. trailing explained |
| Market cap (S3) | Header stat + "price × number of shares" |
| DPR (S3–4) | Shareholders card |
| Cash flow / DCF (S2) | FCF card explaining "cash in minus cash out" |
| Intrinsic value vs. price (S2, S4) | Analyst price-target bar framed as "what pros think it's worth vs. price" |
| Margin of safety (S4) | Optional card: student enters their own value estimate and sees the gap vs. current price |
| Circle of competence (S4) | Prompt on the thesis box: "Can you explain this business to a 10-year-old?" |
| Hindsight bias / opportunity cost (S2) | Quiz items |
| Ticker anatomy `NASDAQ:AAPL` (S4) | Header shows exchange:ticker with a tooltip |
| Summer challenge thesis (S4) | "Your thesis" notes box exportable as a one-page Buy/Sell/Hold PDF/print view |

**Quiz mode:** generated mostly from rules, not AI (deterministic, free, always correct), e.g. "AAPL's P/E is 34. Is the market paying for growth or stability?" with immediate explanation. A small AI-generated pool can be added later and cached.

## 6. Teacher mode (v1: no accounts, so it must be lightweight; the full teacher console arrives with Phase 2, §13)

- A **shareable URL** encoding a curated list (e.g. `/class?tickers=KO,NVDA,MC.PA&hideAI=1`) for assignments. No login needed.
- A **hide-AI flag** for exercises where students must analyse before seeing the thesis (this is the "student first" flow, available per link).
- A simple password-protected `/teacher` page is optional. Skip unless you want it (❓).

## 7. Architecture

```
Browser (Next.js client)
   │   /api/search?q=            ─┐
   │   /api/stock/[symbol]        │  Next.js route handlers (server)
   │   /api/chart/[symbol]?range  │   • zod-validate input
   │   /api/ai/[symbol]?lang      │   • rate-limit (Upstash counter)
   ▼                              ▼   • Upstash cache + stale copy + lock (quote 30–60 s, charts by range, fundamentals 12–24 h, AI per ticker/lang/week)
 Provider layer: MarketDataProvider interface
   ├─ YahooProvider (primary, yahoo-finance2)
   ├─ FinnhubProvider / TwelveDataProvider (fallback prices; optional)
   └─ SnapshotProvider (static JSON for curated tickers; last-resort degraded mode)
 AI layer: GeminiClient (model fallback chain, JSON schema, cache)
```

**Resilience & abuse rules (from the plan review):**
- *Rate limiting:* 15 students may share one school IP, so per-IP limits use a **high ceiling** (~300 requests/min) in an Upstash counter. Yahoo and Gemini are protected by **cache + request coalescing + the curated list**, not by tight per-IP limits.
- *Public API:* `/api/*` is effectively a Yahoo redistribution endpoint if left open. Add `noindex`/`robots.txt`, an Origin/Referer check, and (optional, §10) a shared club code. Show an "unofficial data, may be delayed or wrong, no redistribution" notice.
- *Observability:* a `/api/health` route reports per-provider status and last-success time; the UI shows a visible "data source degraded" banner. A **weekly GitHub Action** runs the live smoke script so we find out Yahoo broke before class, not from a student.
- *Server-only code:* provider and AI modules `import 'server-only'` so `yahoo-finance2` and zod schemas never enter the client bundle; the shared **contract is types only**.

Key rules: the browser never talks to Yahoo or Gemini directly; API keys only in Vercel env vars; every provider response is normalized into **our own types** (`Quote`, `Candle[]`, `Fundamentals`, `AnalystView`) so a source can be swapped without touching the UI.

Suggested layout:
```
StockLens/
├─ PLAN.md  README.md  .gitignore
├─ .claude/agents/    (data-engineer.md, frontend-engineer.md, see §12)
├─ Assets/            (logo source)
├─ Lectures/          (local only, git-ignored)
├─ app/               (routes, pages)
├─ components/        (chart, metric cards, analyst bar, thesis, quiz)
├─ lib/contract/      (versioned shared TYPES only: Quote, Candle, Fundamentals, ...)
├─ lib/providers/     (server-only: yahoo.ts, snapshot.ts, optional finnhub.ts, zod schemas)
├─ lib/data/          (frontend data-access layer: fixtures ⇄ live /api switch)
├─ docs/design-notes.md  (apple-ui rules + polish-pass log)
├─ lib/ai/            (gemini.ts, prompt.ts, schema.ts)
├─ lib/education/     (glossary.fr.json, glossary.en.json, quiz rules)
├─ messages/          (fr.json, en.json)
├─ tests/             (data tests + fixtures incl. sparse/, ui tests in tests/ui/)
└─ .github/workflows/ (CI: typecheck + lint + tests; weekly live smoke)
```

## 8. Roadmap

> The execution order is the **6-step plan in §11**, with agents defined in §12. The phase checklists below are the detailed task lists.

**Phase 0 — Foundations & de-risking (do first)**
- [ ] Create GitHub repo (public), connect to Vercel
- [ ] Scaffold Next.js + TS + Tailwind + shadcn + next-intl
- [ ] **Throwaway Vercel deployment calling `yahoo-finance2`** from the server: do we get throttled? (decides Plan A vs B)
- [ ] You create a Gemini API key in AI Studio; we record real free-tier RPM/RPD and pick the model
- [ ] Extract brand colours + create favicon/wordmark assets from the logo
- [ ] Provider interface + normalized types + zod schemas

**Phase 1 — Core MVP**
- [ ] Search (autocomplete) + stock page shell
- [ ] Chart with all 8 ranges, currency/timezone handling, market-closed behaviour
- [ ] Key-numbers cards with optional-metric handling
- [ ] Analyst section (rating bar + target range)
- [ ] Caching + rate limiting
- [ ] FR/EN UI

**Phase 2 — AI + education**
- [ ] Gemini integration: company explainer + bull/bear/hold, structured JSON, cache
- [ ] Glossary, tooltips, "explain this metric"
- [ ] Watchlist + notes + one-page thesis export
- [ ] Quiz cards
- [ ] Teacher links (curated list, hide-AI flag)

**Phase 3 — Polish & hardening**
- [ ] Fallback providers, graceful degraded mode ("live data temporarily unavailable, showing last known")
- [ ] Accessibility pass, dark mode, mobile QA, performance (Lighthouse)
- [ ] Compare page; macro page (FRED) as Phase 3+ / v2
- [ ] Disclaimer/About page, data-source credits

**Phase 1.5: Home dashboard (Step 3b, P1)**
- [ ] `/api/market` and `/api/quotes` batch endpoints (cached, coalesced), contract v0.3.0
- [ ] Dashboard tiles 1 to 5 and 7 first; movers (6) and sectors (8) only if time remains
- [ ] Watchlist and recently viewed in `localStorage`; learning strip wired in Step 5

**Phase 4: Accounts, groups & paper trading (post-launch, §13)**
- [ ] Steps 7 to 11 in §13 (auth, wallets and trading engine, groups, teacher console, performance and hardening)

**Definition of done for v1:** a student on a phone can search "LVMH", "Apple" or "Toyota", switch all 8 ranges, read the numbers with tooltips, see analyst data, read the AI bull/bear/hold in FR or EN, and save notes, all on a free deployment.

## 9. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Yahoo throttles/blocks Vercel IPs | Medium | Phase 0 test; aggressive caching; fallback providers; Plan B hosting |
| Yahoo changes API/module shapes (already happened Nov 2024) | Medium | zod validation, provider abstraction, per-card error states, pin library version, contract tests with recorded fixtures |
| Yahoo's terms: unofficial API; secondary sources say automated collection is restricted with no clear personal-use carve-out (Yahoo's text not verified) | **Medium** | Non-commercial, no ads; `noindex`; Origin check / optional club code so our `/api` isn't an open redistribution endpoint; "unofficial data" notice; keep the contract + snapshot so the source is swappable |
| Gemini free-tier terms: 18+ only, no minor-facing clients, paid-only for EEA/CH/UK, content may be reviewed by humans | Low **given the stated audience** (adults outside those regions) | Recorded in §2/§3.5; send no student data; revisit if the audience changes (fallback: pre-generated reviewed content or another provider) |
| Currency mix-ups (price vs financial vs target currency, `GBp`) | Medium | Three currency fields + unit table in the contract; hide cards when units can't be reconciled; ADR (`TSM`) and LSE stocks in the test matrix |
| Class-time thundering herd (15 users, same ticker, same minute) | High without a shared store | Upstash cache + lock + stale copy; pre-warm curated tickers; Step 6 dry run with 15 simultaneous tabs |
| Full scope in ~2 weeks | High | Priority tiers P0/P1/P2 (§11); cut P2 first, never P0 |
| Gemini free quotas/models change (real RPD unknown; reports say sharply cut, per project) | Medium-High | Record real RPD in Step 1; one generation per ticker/lang/week via lock; pre-warm curated list; model fallback chain in one config; static "AI unavailable" state |
| AI hallucinations / bad numbers | Medium | Ground only on supplied data; schema output; disclaimer; spot checks |
| Missing data for non-US tickers | High | Everything optional; clear "n/a" states; test on US + EU + Asia tickers |
| 1H chart empty when market closed | High | Show last trading hour, label it |
| Public repo leaking secrets or lecture PDFs | Medium | `.gitignore` (done), `.env.example` only; Lectures stay local (course material may be copyrighted or club-internal; ❓ tell me if you *want* them public) |
| Regulatory / "financial advice" perception; privacy | Low | Prominent educational disclaimer; Buy/Hold/Sell framed as arguments; **no brokerage features: Phase 2 trading is virtual only, with no real orders or money, stated everywhere**; bilingual About/Privacy page; no Vercel Analytics, third-party fonts or CDNs (system fonts only); localStorage only |
| Logo ownership/licence in a public repo; no LICENSE file | Low | ❓ confirm you own the logo (§10); choose a LICENSE; enable GitHub secret scanning/push protection (free on public repos) |
| Phase 2 scope creep (accounts + trading engine + teacher rules is a product of its own) | High | Separate release after the first class; own steps and checkpoints (§13); minimum viable subset first; no work starts before the launch is stable |
| Paper-trading integrity (client-supplied prices, double submits, races, stale quotes) | Medium | Server-only prices, one append-only ledger, DB transactions with idempotency keys, a pure rules engine with heavy tests, trading disabled when data is stale (§13.5) |
| Student personal data (email, name, `@handle`, positions) | Medium | Collect the minimum, handles instead of real names on shared screens, teacher-controlled visibility, privacy page updated, nothing personal ever sent to Gemini, delete-my-account path (§13.8) |
| Phase 2 breaks the $0 rule (auth and database free tiers) | Medium | Confirm free limits at the time (§13.2); ~15 to 30 users is far inside any free tier; keep a no-account fallback |

## 10. Open questions ❓

1. **Revenue vs. expectations:** OK with "revenue trend + forward estimate" instead of a true past-quarter revenue beat/miss (Yahoo doesn't provide it)?
2. **Lectures in the public repo:** I git-ignored `Lectures/` by default. Keep local-only?
3. **Do you want the first screen "start here" list curated by you?** If so, give me ~8–10 tickers (mix of US/EU/Tunisia-relevant?).
4. **Tunisian / MENA tickers:** Yahoo coverage of the BVMT (Tunis exchange) is poor or none. Is that a requirement, or "major world tickers" is enough?
5. **Currency display:** show native currency only, or also a converted view (EUR/USD/TND)? Native only is simpler and recommended for v1.
6. **Name/branding checks:** "StockLens" may clash with existing products. Is a quick trademark/domain search worth doing before you share it publicly?
7. **Teacher page password** (§6): yes/no?
8. ~~**Timeline**~~ **Answered:** ~2 weeks to first student use, full scope kept → staged by priority tier (§11).
9. **Club code gate:** a shared "club code" (entered once, stored in a cookie) in front of the app/API, to keep it from being an open public Yahoo/Gemini proxy? Recommended; costs students one extra step.
10. **Logo:** do you own it (or generated it with a tool whose terms allow this use)? It's in a public repo. And which **LICENSE** for the code (MIT is the usual choice)?
11. **Privacy/Terms page:** you (the professor) sign off on the wording before launch?
12. **Phase 2 rules and policy questions** (wallet currency, fills, leverage, fees, group authority, visibility, grading) are listed in §13.9. They are not needed before launch.

## 11. Implementation plan: 6 steps

This is the **execution order**. The Phase 0–3 checklists in §8 are the detailed task lists these steps draw from (Step 1 = Phase 0, Steps 2–3 = Phase 1, Steps 4–5 = Phase 2, Step 6 = Phase 3).

Each step ends with a **user checkpoint**: nothing moves on, and nothing is committed or pushed, until you've looked at it and said go.

| # | Step | Lead | Main deliverables | Exit criteria (checkpoint) |
|---|---|---|---|---|
| 1 | **Foundations & de-risking** | Orchestrator, with `data-engineer` for the spike | Next.js + TS + Tailwind + shadcn + next-intl scaffold; throwaway Vercel deployment calling `yahoo-finance2` for `AAPL`, `MC.PA`, `7203.T`; Gemini key created and real free-tier quota/model recorded; brand tokens and favicon/wordmark from the logo; **data contract v0** (`lib/contract/**`, types only) built from real recorded payloads for `AAPL`, `MC.PA`, `7203.T` and one sparse case; Upstash provisioned; **multi-day Yahoo soak test started** (§3.3); real Gemini RPD recorded in §3.5; CI skeleton (typecheck + lint + tests) | Soak test running (verdict due before Step 3 closes; Plan B per §3.6 if it fails); Gemini RPD written into §3.5; contract v0 reviewed by you; CI green; `.env.example` exists, no secret committed; GitHub secret scanning on |
| 2 | **Data layer & API** | `data-engineer` | `MarketDataProvider` + Yahoo implementation; search, quote, chart (8 ranges), fundamentals via `fundamentalsTimeSeries`, analyst data, earnings; currency/`GBp`/timezone handling; caching and per-IP rate limit; fixtures for US/EU/Asia **plus sparse cases** (ETF, loss-maker, bank, ADR such as `TSM`, an LSE stock); **data-availability matrix**; Upstash cache/stale/lock; `/api/health`; unit tests | `/api/search`, `/api/stock/[symbol]`, `/api/chart/[symbol]` work for `AAPL`, `MC.PA`, `7203.T` with missing fields returned as `null` + reason; tests green; availability matrix and live smoke output reviewed; a cold-start test with 15 parallel requests for one ticker causes **one** upstream fetch |
| 3 | **Core UI** | `frontend-engineer` | Home + search with autocomplete; stock page: header, chart with 8 ranges, key-number cards (EPS vs. expectation, P/E, revenue, operating profit, FCF, market cap), analyst section; FR/EN; responsive, dark mode, skeleton/error states; **first `apple-ui` polish pass** | You can search a company on your phone and read the whole page in FR and EN, including a sparse-data company, with no broken cards; the page passes the apple-ui self-critique checklist; Lightweight Charts attribution (`attributionLogo`) and NOTICE are present |
| 3b | **Home dashboard** (tier P1) | `data-engineer` (small: `/api/market`, `/api/quotes`, contract v0.3.0), then `frontend-engineer` | The 10 tiles of §4.3 (tiles 6 and 8 last / optional); batch endpoints with shared cache; watchlist, recently viewed, curated starters; per-tile skeleton and error states; second `apple-ui` polish pass on the home page | Home on a phone shows markets, watchlist and starters with no empty-looking screen; a dashboard load costs a few upstream calls and the 15-tab cold start is still one fetch per symbol; one tile can fail without breaking the rest |
| 4 | **AI layer** | `data-engineer` (API) then `frontend-engineer` (display) | Gemini client with model fallback chain; grounded prompt; schema-enforced JSON; per `(ticker, language, day)` cache; `/api/ai/[symbol]`; company explainer + bull/bear/hold columns with the disclaimer | The thesis for 3+ tickers is readable, consistent with the on-page numbers, available in FR and EN, and still works (or degrades cleanly) when the quota is exhausted |
| 5 | **Education & teacher features** | `frontend-engineer` | Glossary + tooltips + "explain this metric" in lecture voice; "Séance N" tags; rule-based quiz cards; margin-of-safety card; watchlist, notes and one-page thesis export; teacher links (`?tickers=…&hideAI=1`) | **You (the professor) review all French/English educational copy**; a teacher link works end to end |
| 6 | **Hardening, QA & launch** | Orchestrator, both agents on fixes | Fallback providers and "stale data" mode; accessibility and Lighthouse pass; ticker test matrix (US, EU, Asia, ETF, a loss-making company, a semi-annual reporter); about/disclaimer/credits page; README; production deploy; `/code-review` pass; final `apple-ui` polish pass in light and dark mode | Meets the v1 definition of done in §8; **class dry run with 15 simultaneous tabs** (no 429s, AI quota survives); soak-test verdict is "pass"; Privacy/Terms page signed off by you; link ready to share with the club |

**Parallelism:** once Step 1 publishes **contract v0** (built from real recorded payloads, not guesses), Steps 2 and 3 run **in parallel**. The `frontend-engineer` builds against recorded fixtures while the `data-engineer` builds the real routes, then a one-flag switch in `lib/data/**` points the UI at live data. The contract is **versioned, not frozen**: Step 2 will discover real-world shapes, so the `data-engineer` may issue additive v1.x changes (breaking changes go through the orchestrator). Step 4's API half can start as soon as Step 2's data shapes are stable.

### Step 1 status (2026-11-05): everything that needs no login is done

Instruction: "ignore the logins for now and build around it". So the offline half of Step 1 is built and verified; the parts that need an account are prepared and parked.

**Done and verified** (`npm run check` green: typecheck, lint, 22 tests; `npm run build` green; production server smoke-tested):
- Next.js 16 + TypeScript + Tailwind 4 + next-intl scaffold (FR default, `/fr` and `/en`, `proxy.ts` for locale routing), shadcn config + `cn()` helper, `noindex` header + meta, system fonts, brand tokens in `app/globals.css`. **Cache Components / PPR switched off** (the scaffold's default): our data is dynamic and cached in Upstash, so that model only added friction.
- Brand assets from the logo: transparent wordmark (dark + light-mode variant, PNG/WebP), gradient mark, favicon / app icons. Sampled gradient: `#f89349` → `#e36092` → `#d747c8` → `#982ef8`.
- **Real Yahoo payloads recorded** (`tests/fixtures/raw/`) for `AAPL`, `MC.PA`, `7203.T`, plus sparse/currency cases `SPY` (ETF) and `TSM` (ADR), plus two searches. All 10 quoteSummary modules, `fundamentalsTimeSeries` and both chart intervals returned data.
- **Data contract v0.1.0** (`lib/contract/**`, types only) built from those payloads, plus a prototype normaliser (`scripts/build-contract-fixtures.ts`) that fills it from the raw recordings, type-checked, giving **contract-shaped fixtures** (`tests/fixtures/contract/`) the frontend can build against now. Step 2 replaces the prototype with the real provider.
- CI skeleton (`.github/workflows/ci.yml`), `.env.example`, README, `docs/design-notes.md` (apple-ui rules copied in), soak-test script (`scripts/soak.ts`) and a throwaway spike route (`app/api/spike`, to delete after the soak verdict).
- Live check from this machine: `yahoo-finance2` answered 200 for all three tickers through the Next route. This does **not** answer the Vercel question (§3.3).

**Parked: needs your accounts / decisions** (nothing here blocks Steps 2 and 3 starting on fixtures):
- [ ] Create the GitHub repo + enable secret scanning / push protection; connect to Vercel.
- [ ] Deploy the spike route, then run `SOAK_URL=… npm run soak` for 3–5 days (the verdict is still due before Step 3 closes).
- [ ] Create the Gemini key in AI Studio and record the real RPM/RPD in §3.5.
- [ ] Provision Upstash (via the Vercel Marketplace) and fill `.env.local`.
- [ ] Orchestrator test: can a subagent drive the Chrome extension (§12)? Needs an agent spawn, so it waits for your go.
- [ ] Review contract v0 (checkpoint), then say go for Step 2 and Step 3 in parallel.

**New data-reality findings from the recordings** (all encoded in the contract and tests):
1. **Percent units are inconsistent in Yahoo itself**: `quote.dividendYield` = 3.12 (percent) but `summaryDetail.dividendYield` = 0.0312 (fraction); `quote.regularMarketChangePercent` = 0.58 vs. `price.…` = 0.0058. The contract uses **fractions everywhere**; the provider normalises.
2. **Semi-annual reporters (LVMH)**: the "quarterly" time series returns rows with balance-sheet lines only, no revenue / operating income / net income / FCF. Contract reason: `reported_less_often`; the UI falls back to annual figures. LVMH also has empty `earningsHistory`, so "EPS vs. expected" is blank for it (as §3.2 predicted).
3. **Yahoo keeps serving a past "next earnings" date** until the next one is scheduled (LVMH showed July 2026). The provider drops dates older than 2 days.
4. **Analyst-target currency**: for `TSM`, `financialData.financialCurrency` says TWD but the target (≈ 587) is clearly USD. The contract carries `PriceTarget.currency` decided by the provider, with a plausibility guard (target/price outside 0.2–5 → `currency_mismatch`, card hidden). Revenue estimates for TSM are in TWD while EPS estimates are in USD, hence a currency on every `Estimate`.
5. ETFs (`SPY`): `financialData`, `earningsHistory`, `earningsTrend`, `recommendationTrend`, `calendarEvents` all throw "No fundamentals data"; time series are empty. These sections become `not_applicable_for_type`.
6. Toyota's quote showed a +16.7 % move on its earnings day; a reminder that change % can legitimately be large, so the UI must not treat big numbers as errors.

⚠️ Decisions for you at the checkpoint: contract shape (esp. `Metric<T>` = value-or-reason on every section), and whether the LICENSE / logo-ownership questions (§10 Q10) are settled before the repo goes public.

### Steps 2 and 3 status (2026-11-05, built in parallel, merged locally on `main`, not pushed)

- **Step 2 (data-engineer):** `YahooProvider` + zod, 8 chart ranges, cache layer (Upstash store + in-memory fallback, stale copy, lock, persisted cookie), routes `/api/search|stock|chart|health|club`, `docs/data-availability.md`, live smoke script, 15-parallel-request cold start = 1 upstream fetch (unit-tested and on a production server). **Contract is now v0.2.0** (additive). Upstash is verified only against a mock until provisioned.
- **Step 3 (frontend-engineer):** home + search, stock page (header, 8-range chart, 6 cards, analyst bars), About page with Lightweight Charts NOTICE, FR/EN, dark mode, sparse-data states, `lib/data` fixtures/live switch (`NEXT_PUBLIC_DATA_MODE`), first apple-ui polish pass.
- **Integration check:** merged `npm run check` (261 tests) and a live-mode build + production server returned real data through the UI's routes.
- **Chrome from a subagent: does NOT work** ("Browser extension is not connected"). Fallback that worked: driving the installed Chrome over the DevTools protocol (script kept outside the repo). Playwright not needed for now.
- **Open for you:** professor review of all FR copy; Shell/ADR P/E hidden on currency mismatch (OK, or show with a warning?); club-code gate on for launch (needs a UI to enter the code)?

### Steps 3b and 4 status (2026-11-07)

- **Step 3b done:** home dashboard (markets, watchlist, recents, start here, earnings, placeholders), `/api/quotes`, `/api/market`, `/api/ticker` (25 items), market band on every page. Contract v0.3.1.
- **Step 4 done:** AI layer with a multi-provider chain (§3.5), contract v0.4.0 (`/api/ai/[symbol]`), thesis UI on the stock page in all states, FR/EN, pre-warm script (`npm run ai:prewarm`, not yet run). Details in `STEPS.md`.
- **Step 5 built** (2026-11-07): 5a glossary and Séance tags, 5b notes/pick/teacher links, 5c quiz/margin of safety/export. 5d (the professor's review of all FR/EN copy) is open. Details in `STEPS.md`.
- **Step 6 started** (2026-11-07): hardening, QA and launch. First finding: the soak test had been measuring a redirect since the domain rename, so there is still no soak verdict; workflow fixed. Details in `STEPS.md`.

### Schedule (~2 weeks) and priority tiers

Full scope in ~2 weeks is **high risk** (flagged by the plan review). We keep all the scope but deliver in tiers, so if time runs short we cut P2 first and never P0:

| Tier | Contents | Target |
|---|---|---|
| **P0: must work for the first class** | Search; chart with 8 ranges; 6 key cards (EPS vs. expected, P/E trailing+forward, revenue, operating profit, FCF, market cap); analyst bar + price targets; FR/EN; disclaimer + Privacy/Terms page; stale/degraded mode; AI explainer + bull/bear/hold (Buy/Hold/Sell as arguments) with caching | end of week 1 (soft launch), polished by day ~10 |
| **P1: should have** | Glossary + tooltips + "explain this metric"; Séance tags; watchlist; notes; teacher links (`?tickers=…&hideAI=1`); dark mode; apple-ui polish passes; curated "start here" list | week 2 |
| **P2: nice to have (cut first)** | Margin-of-safety card; one-page thesis export/print; compare page; quiz beyond ~10 rule-based items; macro page (already phase 2) | only if time remains |

Rough calendar: **days 1–2** Step 1 · **days 2–6** Steps 2 and 3 in parallel · **days 6–9** Step 4 · **days 9–12** Step 5 · **days 12–14** Step 6 and class dry run. The professor reviews at each checkpoint, so reviews must be quick to keep this pace.

**Schedule impact of the new scope (v4):** the dashboard (Step 3b) adds about **2 days** and sits in tier P1 (cut tiles 6 and 8 first). It runs after Step 3 and can overlap Step 4's AI work, since the dashboard's data piece is small. **Phase 2 (§13) is not in the 2-week window:** it starts only after the first class has used v1 and the soak verdict is in.

## 12. Agents

Three roles in total for v1: you plus two worker agents (Phase 2 adds a `trading-engineer`, §13.7). Orchestrator-only would be slow, because the UI and the data/AI layer are independent workstreams after the contract is frozen. Splitting further would add coordination cost for a 15-student app, so we stop at two.

| Role | Runs as | Model | Owns | Definition |
|---|---|---|---|---|
| **Orchestrator** | The main Claude Code session | Sonnet (run the session on Sonnet) | `PLAN.md`; **all root config and dependencies** (`package.json` + lockfile, `next.config`, `tsconfig`, lint/test config, `vercel.json`); `app/layout.tsx`, `middleware.ts` and next-intl setup; CI (`.github/workflows/**`); `README.md`/LICENSE; contract approval; git (commits/pushes only after you approve); GitHub/Vercel/Upstash setup; integration, code review, and talking to you | n/a (this is the session you're in) |
| **`data-engineer`** | Subagent | `sonnet` | `lib/contract/**` (the shared types), `lib/providers/**`, `lib/ai/**`, `app/api/**`, `tests/**` (data tests) and `tests/fixtures/**` **including sparse/missing-data fixtures**, `.env.example`; asks the orchestrator to install dependencies | [`.claude/agents/data-engineer.md`](.claude/agents/data-engineer.md) |
| **`frontend-engineer`** | Subagent | `sonnet` | `app/**` pages (except the root layout/middleware), `components/**`, `messages/**`, `lib/education/**`, **`lib/data/**` (data-access layer)**, `tests/ui/**`, styling, brand assets, `docs/design-notes.md`; asks the orchestrator to install dependencies; runs **`apple-ui` polish passes** | [`.claude/agents/frontend-engineer.md`](.claude/agents/frontend-engineer.md) |

**Ground rules for working together**
- **All agents run on Sonnet or lower** (`model: sonnet` in each definition; nothing uses Opus or Fable).
- **Agents start only when you say so.** The orchestrator proposes each delegation and its brief; you approve it.
- **File ownership is strict** (table above), so parallel work doesn't collide. Neither agent runs `npm install` or edits `package.json`: they list the dependencies they need in their report and the orchestrator installs them. For parallel steps, the orchestrator can use a git worktree per agent and makes **local WIP commits on a feature branch (never pushed)** to merge them; otherwise it runs them sequentially per file area. Agents themselves still never commit.
- **The contract is the handshake.** Only the `data-engineer` edits `lib/contract/**` (types only, **versioned**: v0 from real payloads in Step 1, additive v1.x afterwards), and the `frontend-engineer` asks for changes through the orchestrator.
- **Browser checks:** Chrome tools are deferred tools that must be loaded via `ToolSearch` first, so the frontend agent has `ToolSearch` in its tool list. Whether a subagent can actually drive the Chrome extension is **unverified**: the orchestrator tests this once in Step 1 with a trivial brief. Fallback: Playwright (free, dev dependency, owned by the orchestrator) with headless screenshots at 390 px and 1280 px.
- **No agent commits or pushes.** The orchestrator commits after review and your approval, with plain messages (no attribution lines).
- **Every agent reports in a fixed format** (done / files / how verified / contract changes / open issues / questions) so reviews are quick.
- **`apple-ui` skill:** written for native macOS GUIs, so the `frontend-engineer` applies its *principles* (spacing grid, hierarchy, restraint, feedback, dark mode) to the web and ignores its Tkinter/SwiftUI specifics. Where it conflicts with this plan, the plan wins on product decisions (e.g. the logo gradient stays as the single accent); the skill wins on spacing, typography and hierarchy. It runs as one small, screenshot-driven polish pass after each UI milestone (Steps 3, 5, 6). Because the skill lives in your home folder (not this repo), its web-relevant rules (8 px grid, system type, one accent, one primary action, calm inline feedback, dark mode, restraint) are **copied into `docs/design-notes.md`**, so the project doesn't depend on it.
- Each agent verifies its own work (tests, type check; the UI is also checked in a real browser at phone and desktop width) before reporting. The orchestrator then reviews the diff and re-runs the checks.
- **Not a separate agent:** QA and review. They're the orchestrator's job at each checkpoint (and `/code-review` in Step 6), which avoids a third agent.

## 13. Phase 2: accounts, groups & paper trading

> Status: **idea captured, not scheduled** (2026-11-05). Goal: replicate a paper-trading system. Students trade a virtual wallet alone or in groups (for instance when a trade relates to a lesson), and **the professor sets the rules and limits**: what each student or group starts with, which asset classes are allowed, leverage, position limits, and what each team holds.

### 13.1 How hard is it? (honest answer)

- **Accounts alone are the easy part.** A hosted auth provider handles sign-in, sessions and password or social login; roughly a day of work, plus the privacy changes below.
- **The real work is the trading engine and the teacher's rules.** A trustworthy ledger (no double fills, no client-supplied prices, correct P&L across currencies), a rules engine that enforces the professor's limits on every order, and a group permission model. Order of magnitude: **3 to 4 weeks of part-time work** after v1, in five steps (§13.7).
- **It changes the app's nature.** v1 is stateless and anonymous; Phase 2 stores personal data and money-like state. That is why it is a separate release with its own checkpoints, and why nothing here blocks the first class.
- **Recommendation:** ship v1 for the first class (Steps 1 to 6 plus the dashboard), watch how students actually use it, then build the **minimum viable Phase 2** (§13.6) before adding the rest.

### 13.2 What changes in the v1 decisions

| v1 decision | In Phase 2 |
|---|---|
| No accounts, `localStorage` only | Accounts, with a one-time **import of the local watchlist and notes** into the account. `localStorage` stays as the signed-out fallback |
| Upstash Redis as the only store | Add a **relational database** (Postgres via the Vercel Marketplace, e.g. Neon; confirm the free tier then). A ledger needs transactions and constraints; Redis stays for cache, locks and rate limits |
| `noindex`, club code optional | Stays. Add auth on every `/api/trade|wallet|group|teacher` route; the club-code gate becomes redundant once signed in |
| 18+, outside EEA/CH/UK | Stays (it protects the Gemini terms). Phase 2 also stores personal data, so the privacy page is rewritten and signed off by you |
| Hobby plan, non-commercial | Still fine for a free school club; re-check Vercel's fair-use text if money ever enters |
| Teacher mode = shareable links | Real **teacher console** (§13.4) |

Auth provider options (decide at Step 7): **Clerk or Auth0 through the Vercel Marketplace** (hosted, free tier far above ~30 users, provisioning handled by the `marketplace` skill) or Auth.js with our own database (more control, more code). Recommendation: hosted, to avoid writing password, reset and session code.

### 13.3 Accounts, `@handles` and groups

- **Identity:** sign in with email, Google or Apple (as the provider allows). Each user picks a unique, case-insensitive `@handle` (reserved words blocked); shared screens show handles, not real names, unless you choose otherwise.
- **Roles:** `teacher` (you; can be more than one) and `student`. A student belongs to a **cohort** (a class or season), joined with a class code or invite link that you create.
- **Groups:** any student can create a group (study or trading). Members are added by **`@handle`** or by a **unique invite link** (random token, expiry, max uses, revocable, optional join approval). Roles inside a group: owner and member. Leave, remove and transfer ownership are supported. A group has a size cap you set.
- **Group trading authority (your choice per assignment or globally):** any member can trade, or only the owner, or **majority approval** of a proposed trade. Every trade records who acted.
- **Visibility (your choice):** nobody sees others' positions, group members see their group, or the cohort sees a leaderboard (ranked by **return %**, not dollars, so a big wallet does not win).

### 13.4 The professor's controls (teacher console)

All limits live in a **rule set** you create and attach to a cohort, an assignment, or a single student or group.

| Control | Examples |
|---|---|
| Starting cash | Per student, per group, per cohort; top-ups, reset or new season |
| Asset classes | Allow or block by type (equities, ETFs, indices, FX, crypto, futures), by exchange or country, by currency, or by an explicit ticker universe for a lesson |
| Leverage | Cap at 1x (none), 2x, and so on; shorting on or off; what happens past the limit (block the order, or warn only) |
| Position limits | Max % of equity in one position, max number of positions, min or max order size, cash buffer |
| Costs | Optional commission and slippage so trades are not free (a lesson in itself) |
| Trading window | Market hours only, or a lesson date window |
| Assignments | A lesson-linked task: title and Séance tag, ticker universe, deadline, which groups take part, a rule-set override, and an optional **required "why" note** per trade (links to the thesis box) |
| Oversight | See every wallet, position, trade and P&L; freeze or unfreeze a wallet; undo an invalid trade with an audited reversal; export CSV |
| Visibility | Leaderboard on or off, names or handles |

### 13.5 Trading engine (the part that must be right)

- **Server-only prices.** An order carries a symbol, side and quantity, never a price. The server fills at its own latest quote and stores the price, timestamp, currency and FX rate used. The UI says "delayed N min", because that is what the data is.
- **No fills on bad data.** Reject when the quote is stale or the market is closed (market-hours rule from the rule set), and disable trading with a banner when the provider is degraded. Never fill from a stale fallback.
- **One append-only ledger.** Orders and fills are never edited; corrections are new reversing entries. Positions and cash balances are derived (and cached) from it. Every row has an idempotency key, so a double click or retry cannot fill twice.
- **Transactions and concurrency.** Each order runs in one database transaction with a row lock or version check on the wallet, so two simultaneous orders cannot overspend.
- **Pure rules engine.** `checkOrder(wallet, order, rules, quote)` is a pure, heavily unit-tested function (including property tests: cash never negative beyond leverage, positions reconcile with the ledger, a reversed trade nets to zero). The route handler only wires data in and out.
- **Currency.** Each wallet has one base currency. A foreign-currency asset is converted at the fill-time FX quote (stored on the fill). Sub-unit currencies (`GBp`) reuse the Step 2 handling.
- **Leverage and shorting (if you enable them).** Buying power = equity x leverage cap minus gross exposure; a long position is bought with cash plus margin; a short is a negative position. Past the limit: block, warn, or auto-close, as your rule set says. No borrow fees in the first version.
- **Not modelled at first (and stated in the UI):** dividends, stock splits and mergers, halts and delistings, limit and stop orders, partial fills, overnight margin interest. Splits and dividends can be added later from Yahoo's data; until then the limitation is documented and the teacher can reverse an affected trade.
- **Marking to market.** Open positions use the shared cached quotes; a daily **cron snapshot** of every wallet's equity feeds the performance chart and leaderboard. A history chart per wallet and a benchmark (S&P 500, CAC 40) comparison come from those snapshots.

### 13.6 Priority inside Phase 2

| Tier | Contents |
|---|---|
| **P0 (minimum viable)** | Sign-in and `@handle`; join a cohort by code; individual wallet; market buy/sell, **long only**; teacher sets starting cash, allowed asset classes and a leverage cap; trade history and live P&L; groups by `@handle` and invite link with a shared wallet (any member can trade); simple leaderboard by return % |
| **P1** | Teacher console with rule sets and per-lesson **assignments**; position limits and costs; majority-vote group trades; required "why" note per trade; shorting and leverage above 1x; daily snapshots and performance chart; freeze and reversal tools; CSV export |
| **P2** | Limit and stop orders; dividends and splits; benchmark comparison; seasons and archives; badges or post-mortem prompts; notifications |

### 13.7 Steps (each ends with your checkpoint, like §11)

| # | Step | Lead | Main deliverables | Exit criteria |
|---|---|---|---|---|
| 7 | **Auth, profiles, cohorts** | orchestrator (provider and DB provisioning), `frontend-engineer` | Provider chosen and provisioned; Postgres schema and migrations; sign-in, `@handle`, cohort join by code; teacher role; import of local watchlist and notes; updated privacy page draft | You can sign in on a phone, pick a handle, join a cohort; no personal data reaches Gemini or logs |
| 8 | **Wallets and trading engine** | new `trading-engineer` (see below) | Ledger, rules engine, `/api/trade`, `/api/wallet`; fills from server quotes; stale-data and market-hours guards; P&L and positions; heavy tests including concurrency | A student places buys and sells, P&L is correct on US, EU and a foreign-currency asset; a double submit fills once; stale data blocks trading |
| 9 | **Groups** | `trading-engineer` + `frontend-engineer` | Groups, `@handle` adds, unique invite links, group wallets, authority modes, member and owner management | Two accounts form a group by link and by `@`, trade from the shared wallet, and the ledger shows who did what |
| 10 | **Teacher console** | `frontend-engineer` + `trading-engineer` | Rule sets, caps, asset-class and leverage limits, assignments, wallet oversight, freeze and reversal, CSV export | You configure a cohort, set different limits for two groups, and the engine enforces them (including a blocked order with a clear message) |
| 11 | **Performance, leaderboard, hardening** | orchestrator, both agents | Daily snapshot cron, performance charts, leaderboard, journal link, security review (authorization on every route), load and race tests, privacy page sign-off, deletion path | Class dry run with 15 accounts trading at once; no authorization hole found in review; your sign-off |

**Agents:** the trading engine and database are a distinct domain (money-like integrity), so the plan adds a third worker, **`trading-engineer`**, owning `lib/trading/**`, `lib/db/**` and the trade/wallet/group/teacher API routes. It follows the same ground rules as §12 (Sonnet, strict file ownership, no commits). `data-engineer` stays on market data and AI.

### 13.8 Privacy and security notes

- Collect the minimum: email (from the auth provider), `@handle`, optional display name; no phone, address or date of birth.
- Row-level authorization on **every** route: a student can read and trade only their own wallet and their groups'; only teachers read cohorts. Reviewed in Step 11 (and by `/code-review`).
- Invite tokens are random, expiring, revocable and rate-limited; handle lookup is rate-limited to avoid scraping.
- A "delete my account" path (anonymise trades so cohort statistics stay intact).
- The privacy page states what is stored, where (provider, database region) and who sees what; you sign it off before launch.
- It stays virtual: no real money, no broker connection, and the educational disclaimer appears on every trading screen.

### 13.9 Questions for you (needed before Step 7, not before launch)

1. **Wallet currency:** one base currency for everyone (USD, EUR), or per student?
2. **Starting cash:** a typical amount, and the same for every student or varied (for example per lesson)?
3. **Fills:** immediately at the latest delayed price when the market is open, **or** queued to the next open when it is closed? Allow trading outside market hours at all?
4. **Leverage and shorting:** off by default and enabled per assignment? What maximum?
5. **Costs:** a small commission or slippage, or free trades?
6. **Fractional shares** allowed?
7. **Groups:** who may trade (any member, owner only, or vote), maximum group size, may a student be in several groups?
8. **Who can join:** a class code, or specific school emails? Are real names visible to classmates, or only `@handles`?
9. **Leaderboard:** shown to everyone, to groups only, or to you only? Ranking by return %?
10. **Seasons:** one competition per term with a reset, or a continuous portfolio?
11. **Is it graded?** If yes, I add stronger audit and tamper-evidence, and a clearer dispute and reversal process.
12. **Sign-in methods:** are you comfortable with third-party sign-in (Google or Apple) and students' emails stored by the auth provider?
13. **Dividends and splits:** acceptable as "not modelled at first", with you reversing affected trades by hand?

## 14. Next step

Steps 1 to 5 are built and deployed (https://stocks-lens.vercel.app). The soak verdict is **pass** (270 requests, 0 failures, 2026-11-09). Step 6 (hardening, QA, launch) is in progress; its status is in `STEPS.md`. What is left, in order:
1. **README rewrite, `/code-review`, final apple-ui polish** (6e, 6f).
2. **Provision Upstash**, give the "start here" list, run `npm run ai:prewarm`, then the **class dry run with 15 tabs** (6g).
3. **Professor review** of all FR/EN copy and sign-off of the Privacy/Terms page (5d, 6e).
4. Launch v1. **Phase 2 (§13) only after that.**
