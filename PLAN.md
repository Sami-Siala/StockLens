# StockLens — Project Plan

> Status: **DRAFT v2** (adds the 6-step plan §11 and agents §12) — 2026-11-05. Written after a scoping Q&A and a technical spike (see §3.3).
> Items marked ⚠️ are risks or things still to confirm; items marked ❓ are open questions for you.

## 1. Vision

A free, beginner-friendly, modern web app where a high-school student can look up any major listed company in the world and understand it: price chart, a handful of key financials compared to analyst expectations, analyst sentiment, and an AI-written plain-language explanation with a simple bull / bear / hold thesis, so they can form their own opinion.

**Primary goal: education.** Every number on screen should be explainable at the level of the PMF Investment Society lectures (EPS, P/E, market cap, DPR, DCF, margin of safety, circle of competence), with room to go slightly beyond (FCF, operating margin, forward P/E, analyst targets).

**Audience:** about 15 students (the club). This keeps us comfortably inside every free tier.

**Hard constraint: $0.** Data, AI, hosting and domain must all be free.

## 2. Decisions so far

| Topic | Decision |
|---|---|
| Data | **Yahoo Finance via `yahoo-finance2`**, behind a server-side cache, with fallbacks (Finnhub / Twelve Data free keys for prices, SEC EDGAR for US fundamentals) |
| Language | **Bilingual FR / EN** toggle (UI and AI output). i18n from day one |
| AI thesis flow | **Shown immediately** on the stock page (bull / bear / hold). No "write yours first" gate (a teacher-mode toggle can hide it, see §6) |
| Persistence | **No accounts.** Watchlist and notes in browser `localStorage`, with copy/export |
| Audience | ~15 students |
| Scope | **Stocks first**; macro/bonds page is phase 2 |
| Learning features | Metric tooltips + "explain this metric", **teacher mode**, **quiz / "test yourself"** prompts |
| Repo | GitHub, **public** (so: no secrets, no copyrighted lecture PDFs committed, see §9) |
| Logo | `Assets/3f61d25b-…png`: black rounded wordmark, gradient orange→magenta→purple "o" with 3 bars |

## 3. Technology choices

### 3.1 Stack

- **Next.js (App Router) + TypeScript**, deployed on Vercel. Server route handlers give us a place to hide API keys and cache.
- **Tailwind CSS + shadcn/ui** for a polished, accessible UI quickly.
- **TradingView Lightweight Charts** (free, open source; its attribution requirement is easy to satisfy) for price charts. It handles area/candle, crosshair and range switching well. Fallback: Recharts for the small financial bar charts.
- **next-intl** for FR/EN.
- **Zod** to validate every external payload (Yahoo's shape changes; we never trust it blindly).
- **Upstash Redis (free tier, via Vercel Marketplace)** as a shared cache, mainly for AI output. For 15 users, Next's built-in fetch/route caching + CDN `s-maxage` may already be enough, so start without it and add it only if needed.

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

### 3.3 Spike results (2026-11-05, run from this machine)

- `yahoo-finance2` (it handles Yahoo's cookie/crumb): search, chart (weekly since 2020 on `MC.PA`), and 10 `quoteSummary` modules all returned data for **AAPL, MC.PA (Paris), 7203.T (Tokyo)**.
- Raw `curl` to Yahoo's endpoints got **HTTP 429** on the first call, so we must never call Yahoo from the browser or without the library, and the cache layer is non-negotiable.
- Stooq (a historical free CSV source) now sits behind a JS challenge, so it is **not** usable as a fallback.
- ⚠️ **Not yet tested: calls from Vercel's servers.** Shared datacenter IPs are the main throttling risk. This is the **first thing Phase 0 verifies** with a throwaway deployment.

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
- **Plan:** primary `gemini-3.6-flash` (best quality/speed that's free), fallback chain `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite`. ⚠️ Free model lists and quotas change often; exact RPM/RPD are shown only inside AI Studio, so we confirm them there when you create the key, and keep model names in one config file.
- ⚠️ **Google Search grounding is NOT free on Gemini 3+** (only older 2.5 Flash gets 500/day). So we do **not** rely on live web search. Instead we **ground the AI on the structured data we already fetched** (financials, estimates, analyst data, profile) and tell it to use only that plus well-established general knowledge. This also reduces hallucination and keeps the explanation consistent with the numbers on the page.
- **Output:** structured JSON (schema-enforced) with: `what_it_does` (explain like I'm 15), `how_it_makes_money`, `bull_case`, `bear_case`, `hold_case` (each 2–3 bullets that reference specific metrics shown on the page), `key_risks`, `what_to_watch`, and `glossary_terms_used`.
- **Cache:** one generation per `(ticker, language, day)`; 15 students means a few dozen calls a day at most.
- **Safeguards:** a persistent "Educational content, not financial advice" notice; the AI never says "buy now"; the thesis frames Buy/Hold/Sell as *arguments to evaluate*; temperature kept low; numbers in the thesis are cross-checked against our data where feasible.
- **Privacy:** only public market data goes to Gemini. No student data, no names. Free-tier inputs may be used by Google to improve its products, which is another reason to send nothing personal.

### 3.6 Hosting (the Vercel question)

**Yes, Vercel Hobby works and is free.** Caveats:
- The Hobby plan is **non-commercial, personal use only**. A free school club app is fine as long as nobody is paid for it or it carries ads or sales.
- Hobby limits (per Vercel docs, 2026): function max duration 300 s; usage caps are monthly and generous for 15 users.
- Alternatives if Vercel's IPs get throttled by Yahoo: **Cloudflare Pages/Workers** (free, also edge IPs) or a **tiny free-tier VM** (Oracle Always Free) used as a data proxy. Plan B only; not needed unless Phase 0 says so.
- Domain: free `*.vercel.app` URL (e.g. `stocklens.vercel.app` if available). A custom domain costs money, so skip it.

## 4. Product design

### 4.1 Pages

1. **Home:** big search bar, a few "start here" companies (teacher-curated), your watchlist, market status. Logo-forward, calm.
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
   8. Footer: data sources, delay notice, disclaimer.
3. **Compare** (stretch): two tickers side by side. Great for the "Maison Dorée vs NovaTech" style discussions.
4. **Learn / Glossary:** every term with definition, formula, example in the lectures' voice (the "café d'Aziz"), and "Séance N" tags.
5. **Teacher mode** (see §6).
6. **Macro (phase 2):** Fed rate, CPI, US10Y / FR10Y yields, USD index. FRED API is free with a key. Mirrors Séances 4 and the debt lecture.

### 4.2 Design principles
- Beginner first: progressive disclosure. The first screen shows 6–8 numbers, not 60.
- Every number has a **plain-language label**, a **tooltip**, and a **"good / typical / high" context** (e.g., P/E vs. a sector rule of thumb), clearly labelled as a rule of thumb.
- Brand: white/near-white canvas, black wordmark, **orange → magenta → purple gradient** from the logo as the accent (sample exact hex values from the PNG in Phase 0). Rounded geometric type to echo the wordmark (e.g., a rounded sans such as *Nunito* / *Quicksand* for headings, Inter for body numbers).
- Green/red for up/down must **also** use icons/arrows (colour-blind safe). Dark mode supported.
- Mobile-first: students will open this on phones.
- Skeleton loaders and graceful per-card errors: one failed Yahoo module never breaks the page.
- Logo: derive a square favicon/app icon from the gradient "o" mark, plus an SVG/WebP wordmark for fast loading. The original PNG is ~150 KB on a white background, so we'll cut a transparent version (⚠️ may need a re-export from you if a clean cutout isn't possible).

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

## 6. Teacher mode (no accounts, so it must be lightweight)

- A **shareable URL** encoding a curated list (e.g. `/class?tickers=KO,NVDA,MC.PA&hideAI=1`) for assignments. No login needed.
- A **hide-AI flag** for exercises where students must analyse before seeing the thesis (this is the "student first" flow, available per link).
- A simple password-protected `/teacher` page is optional. Skip unless you want it (❓).

## 7. Architecture

```
Browser (Next.js client)
   │   /api/search?q=            ─┐
   │   /api/stock/[symbol]        │  Next.js route handlers (server)
   │   /api/chart/[symbol]?range  │   • zod-validate input
   │   /api/ai/[symbol]?lang      │   • rate-limit per IP (tiny)
   ▼                              ▼   • cache (revalidate: quote 30–60 s, charts by range, fundamentals 12–24 h, AI 24 h)
 Provider layer: MarketDataProvider interface
   ├─ YahooProvider (primary, yahoo-finance2)
   ├─ FinnhubProvider / TwelveDataProvider (fallback prices; optional)
   └─ EdgarProvider (US fundamentals fallback; phase 3)
 AI layer: GeminiClient (model fallback chain, JSON schema, cache)
```

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
├─ lib/providers/     (yahoo.ts, finnhub.ts, types.ts)
├─ lib/ai/            (gemini.ts, prompt.ts, schema.ts)
├─ lib/education/     (glossary.fr.json, glossary.en.json, quiz rules)
├─ messages/          (fr.json, en.json)
└─ tests/
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

**Definition of done for v1:** a student on a phone can search "LVMH", "Apple" or "Toyota", switch all 8 ranges, read the numbers with tooltips, see analyst data, read the AI bull/bear/hold in FR or EN, and save notes, all on a free deployment.

## 9. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Yahoo throttles/blocks Vercel IPs | Medium | Phase 0 test; aggressive caching; fallback providers; Plan B hosting |
| Yahoo changes API/module shapes (already happened Nov 2024) | Medium | zod validation, provider abstraction, per-card error states, pin library version, contract tests with recorded fixtures |
| Yahoo's terms: unofficial API is for personal/non-commercial use | Low for a school club | Keep non-commercial, no ads, no redistribution of data, show source attribution |
| Gemini free quotas/models change | Medium | Model fallback chain in one config; cache per ticker/day; static "AI unavailable" state |
| AI hallucinations / bad numbers | Medium | Ground only on supplied data; schema output; disclaimer; spot checks |
| Missing data for non-US tickers | High | Everything optional; clear "n/a" states; test on US + EU + Asia tickers |
| 1H chart empty when market closed | High | Show last trading hour, label it |
| Public repo leaking secrets or lecture PDFs | Medium | `.gitignore` (done), `.env.example` only; Lectures stay local (course material may be copyrighted or club-internal; ❓ tell me if you *want* them public) |
| Regulatory/"financial advice" perception for minors | Low | Prominent educational disclaimer; no brokerage/trading features |

## 10. Open questions ❓

1. **Revenue vs. expectations:** OK with "revenue trend + forward estimate" instead of a true past-quarter revenue beat/miss (Yahoo doesn't provide it)?
2. **Lectures in the public repo:** I git-ignored `Lectures/` by default. Keep local-only?
3. **Do you want the first screen "start here" list curated by you?** If so, give me ~8–10 tickers (mix of US/EU/Tunisia-relevant?).
4. **Tunisian / MENA tickers:** Yahoo coverage of the BVMT (Tunis exchange) is poor or none. Is that a requirement, or "major world tickers" is enough?
5. **Currency display:** show native currency only, or also a converted view (EUR/USD/TND)? Native only is simpler and recommended for v1.
6. **Name/branding checks:** "StockLens" may clash with existing products. Is a quick trademark/domain search worth doing before you share it publicly?
7. **Teacher page password** (§6): yes/no?
8. **Timeline:** any date by which students should be using it (e.g., next session)? This decides how much we cut from Phase 2.

## 11. Implementation plan: 6 steps

This is the **execution order**. The Phase 0–3 checklists in §8 are the detailed task lists these steps draw from (Step 1 = Phase 0, Steps 2–3 = Phase 1, Steps 4–5 = Phase 2, Step 6 = Phase 3).

Each step ends with a **user checkpoint**: nothing moves on, and nothing is committed or pushed, until you've looked at it and said go.

| # | Step | Lead | Main deliverables | Exit criteria (checkpoint) |
|---|---|---|---|---|
| 1 | **Foundations & de-risking** | Orchestrator, with `data-engineer` for the spike | Next.js + TS + Tailwind + shadcn + next-intl scaffold; throwaway Vercel deployment calling `yahoo-finance2` for `AAPL`, `MC.PA`, `7203.T`; Gemini key created and real free-tier quota/model recorded; brand tokens and favicon/wordmark from the logo; **data contract** (`lib/providers/types.ts`, zod schemas) agreed | Vercel can fetch Yahoo data (Plan A) or we've chosen Plan B (§3.6); contract reviewed by you; `.env.example` exists, no secret committed |
| 2 | **Data layer & API** | `data-engineer` | `MarketDataProvider` + Yahoo implementation; search, quote, chart (8 ranges), fundamentals via `fundamentalsTimeSeries`, analyst data, earnings; currency/`GBp`/timezone handling; caching and per-IP rate limit; fixtures for US/EU/Asia; unit tests | `/api/search`, `/api/stock/[symbol]`, `/api/chart/[symbol]` work for `AAPL`, `MC.PA`, `7203.T` with missing fields returned as `null` + reason; tests green; live smoke output reviewed |
| 3 | **Core UI** | `frontend-engineer` | Home + search with autocomplete; stock page: header, chart with 8 ranges, key-number cards (EPS vs. expectation, P/E, revenue, operating profit, FCF, market cap), analyst section; FR/EN; responsive, dark mode, skeleton/error states | You can search a company on your phone and read the whole page in FR and EN, including a sparse-data company, with no broken cards |
| 4 | **AI layer** | `data-engineer` (API) then `frontend-engineer` (display) | Gemini client with model fallback chain; grounded prompt; schema-enforced JSON; per `(ticker, language, day)` cache; `/api/ai/[symbol]`; company explainer + bull/bear/hold columns with the disclaimer | The thesis for 3+ tickers is readable, consistent with the on-page numbers, available in FR and EN, and still works (or degrades cleanly) when the quota is exhausted |
| 5 | **Education & teacher features** | `frontend-engineer` | Glossary + tooltips + "explain this metric" in lecture voice; "Séance N" tags; rule-based quiz cards; margin-of-safety card; watchlist, notes and one-page thesis export; teacher links (`?tickers=…&hideAI=1`) | **You (the professor) review all French/English educational copy**; a teacher link works end to end |
| 6 | **Hardening, QA & launch** | Orchestrator, both agents on fixes | Fallback providers and "stale data" mode; accessibility and Lighthouse pass; ticker test matrix (US, EU, Asia, ETF, a loss-making company, a semi-annual reporter); about/disclaimer/credits page; README; production deploy; `/code-review` pass | Meets the v1 definition of done in §8; link ready to share with the club |

**Parallelism:** once Step 1 freezes the contract, Steps 2 and 3 run **in parallel**. The `frontend-engineer` builds against recorded fixtures while the `data-engineer` builds the real routes, then a one-flag switch points the UI at live data. Step 4's API half can start as soon as Step 2's data shapes are stable.

## 12. Agents

Three roles in total: you plus two worker agents. Orchestrator-only would be slow, because the UI and the data/AI layer are independent workstreams after the contract is frozen. Splitting further would add coordination cost for a 15-student app, so we stop at two.

| Role | Runs as | Model | Owns | Definition |
|---|---|---|---|---|
| **Orchestrator** | The main Claude Code session | Sonnet (run the session on Sonnet) | `PLAN.md`, the data contract's approval, git (commits/pushes only after you approve), GitHub/Vercel setup, integration, code review, and talking to you | n/a (this is the session you're in) |
| **`data-engineer`** | Subagent | `sonnet` | `lib/providers/**`, `lib/ai/**`, `app/api/**`, `tests/**`, fixtures, `.env.example` | [`.claude/agents/data-engineer.md`](.claude/agents/data-engineer.md) |
| **`frontend-engineer`** | Subagent | `sonnet` | `app/**` pages, `components/**`, `messages/**`, `lib/education/**`, styling, brand assets | [`.claude/agents/frontend-engineer.md`](.claude/agents/frontend-engineer.md) |

**Ground rules for working together**
- **All agents run on Sonnet or lower** (`model: sonnet` in each definition; nothing uses Opus or Fable).
- **Agents start only when you say so.** The orchestrator proposes each delegation and its brief; you approve it.
- **File ownership is strict** (table above), so parallel work doesn't collide. For parallel steps, the orchestrator can run each agent in its own git worktree and merge the results.
- **The contract is the handshake.** Only the `data-engineer` edits `lib/providers/types.ts`, and the `frontend-engineer` asks for changes through the orchestrator.
- **No agent commits or pushes.** The orchestrator commits after review and your approval, with plain messages (no attribution lines).
- **Every agent reports in a fixed format** (done / files / how verified / contract changes / open issues / questions) so reviews are quick.
- Each agent verifies its own work (tests, type check; the UI is also checked in a real browser at phone and desktop width) before reporting. The orchestrator then reviews the diff and re-runs the checks.
- **Not a separate agent:** QA and review. They're the orchestrator's job at each checkpoint (and `/code-review` in Step 6), which avoids a third agent.

## 13. Next step

Once you answer §10 (or say "defaults are fine"), we start **Step 1**, beginning with the Vercel/Yahoo throwaway test, because it's the one result that can change the architecture.
