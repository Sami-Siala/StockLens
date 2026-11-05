# CURRENT.md: session handoff

Written 2026-11-05 (evening) so a fresh Claude Code session can continue without this conversation.
Read `PLAN.md` for the full plan (esp. §11 steps, §12 agents, and the "Step 1 status" block); this file is
the short "where are we right now" layer on top of it.

## One-paragraph state (updated 2026-11-05, late evening)

**Steps 1, 2 and 3 are built, merged, pushed (`main`) and deployed** to https://stocklens-beryl.vercel.app in **live data mode**
(`NEXT_PUBLIC_DATA_MODE=live` is set on Vercel production; it is read at build time). Contract is **v0.2.0**. The data layer (Yahoo provider,
cache, `/api/search|stock|chart|health|club`) and the core UI (home, stock page, About, FR/EN, dark mode) work end to end, and the
animated logo (bars in the "o" rise 1-2-3, ~2.1 s cycle) shows as a once-per-session splash and as the stock loading state.
The user added two scope items, now in `PLAN.md` v4: the **home dashboard** (§4.3, Step 3b) and **Phase 2 accounts, groups and
paper trading** (§13, after launch). Next up: soak verdict, **Step 3b dashboard**, then Step 4 (needs the Gemini key). Anything
below that still says "Step 2/3 next" is history.

**Open problems right now:** (1) the soak GitHub Action has run only once (manual dispatch); the 5-minute schedule had not fired after
~50 min, so a verdict is still missing (fallback: Vercel cron, or `caffeinate` + `scripts/soak.ts`); (2) Upstash not provisioned, so
`/api/health` says `degraded` and coalescing is per instance; (3) the user's `Assets/` folder has uncommitted changes (original logo
moved, `Assets/Animation/`, `Assets/Default.png`): do not commit them without asking; (4) all FR copy needs the professor's review.

**Working method used this session:** two agents ran in parallel in git worktrees (`../StockLens-wt/data` on `step2-data`, `../StockLens-wt/ui`
on `step3-ui`), local WIP commits, merged into `main`. The worktrees can be removed (`git worktree remove`). A subagent cannot drive the
Chrome extension; use the CDP scripts in the session scratchpad (`cdp.mjs`, `frames.mjs`, `anim.mjs`) or Playwright.
Deploy by hand: `vercel deploy --prod --yes` (Vercel-GitHub auto-deploy is not connected).

## Links and accounts

| Thing | Value |
|---|---|
| GitHub repo (public) | https://github.com/Sami-Siala/StockLens (git user `Sami-Siala`, `gh` logged in, https) |
| GitHub secret scanning + push protection | already **enabled** |
| Vercel deployment | https://stocklens-beryl.vercel.app (project `stocklens`, team scope `stock-lens2`, user `sami-siala`, Hobby, region pinned to `cdg1` Paris via `vercel.json`) |
| Vercel CLI | installed globally (`npm i -g vercel`, v65.11.0), logged in. Project is linked (`.vercel/`, git-ignored) |
| Vercel <-> GitHub auto-deploy | **NOT connected** (the Vercel GitHub app isn't installed on the repo). Deploy by hand: `vercel deploy --prod --yes`. To fix: Vercel project Settings > Git > Connect repo |
| Upstash Redis | **not provisioned**. Plan: Vercel dashboard > Storage > Marketplace > Upstash Redis (free); Vercel injects `UPSTASH_REDIS_REST_URL/TOKEN`; `vercel env pull .env.local` brings them local. Not needed until Step 2's cache work |
| Gemini key | **not created** (needed before Step 4). Create in Google AI Studio, record real RPM/RPD into PLAN §3.5 |
| `.env.local` | exists locally, created by `vercel link` (contains a `VERCEL_OIDC_TOKEN`). Git-ignored. Never commit, never paste |

## What was built (Step 1)

- **App shell:** Next.js 16.4.5 (Turbopack), React 19, TS, Tailwind 4, next-intl 4 (`fr` default, `/fr` `/en`,
  `proxy.ts` does locale routing, `app/[locale]/layout.tsx` is the root layout), shadcn config (`components.json`, `lib/utils.ts` `cn()`).
  **Cache Components / PPR deliberately switched off** in `next.config.ts` (data is dynamic, cached later in Upstash).
  `X-Robots-Tag: noindex` header + robots meta. Placeholder home page only.
- **AGENTS.md** (from the scaffold) says this Next version differs from training data: read
  `node_modules/next/dist/docs/` before writing Next code. Route types: run `npx next typegen` if `PageProps`/`LayoutProps` are missing.
- **Brand:** `public/brand/` (wordmark + `wordmark-light` for dark mode, PNG/WebP; `mark.png`), `app/icon.png`,
  `app/apple-icon.png`, `app/favicon.ico` (must be RGBA). Tokens in `app/globals.css`; gradient stops
  `#f89349` -> `#e36092` -> `#d747c8` -> `#982ef8`; system fonts; tabular numbers; dark mode via `prefers-color-scheme`.
- **Recorded data:** `tests/fixtures/raw/{AAPL,MC.PA,7203.T,SPY,TSM,_search}` (raw Yahoo via yahoo-finance2 v4.0.5, `validateResult:false`).
  Re-record: `npm run fixtures:record` (slow, rate-limited, manual only).
- **Contract v0.1.0:** `lib/contract/*.ts`, types only. Every optional thing is `Metric<T>` = `{value, reason:null} | {value:null, reason}`.
  Ratios are **fractions**. Money carries currency. Three currencies tracked (price / financial / target).
  Approved by the user.
- **Prototype normaliser:** `scripts/build-contract-fixtures.ts` (raw -> contract fixtures in `tests/fixtures/contract/`,
  type-checked against the contract). `npm run fixtures:build`. **Step 2 replaces it** with real `lib/providers/yahoo` + zod.
- **Tests:** `tests/contract-fixtures.test.ts` (22 tests, vitest 5, config is `vitest.config.mts`).
- **Tooling:** `npm run check` (typecheck + lint + tests), `npm run build`, CI at `.github/workflows/ci.yml`, `.env.example`,
  `README.md`, `docs/design-notes.md` (apple-ui rules copied in), `.prettierignore` (excludes PLAN.md, fixtures, `.claude`, public, Assets).
- **Spike + soak:** `app/api/spike/route.ts` (throwaway: `GET ?symbol=AAPL|MC.PA|7203.T`, returns 502 on upstream failure; **delete after the soak verdict**) and `scripts/soak.ts`.

## Soak test (the key de-risking experiment)

- Goal: does Yahoo throttle Vercel's datacenter IPs? Pass = under 2 % non-200.
- Started 2026-11-05 ~20:06 UTC against `https://stocklens-beryl.vercel.app/api/spike`, every 2 min, 3 tickers per tick.
  Log: `soak-log.jsonl` (git-ignored, append-only). At last check: 6 requests, 0 non-200.
- It was launched as a **background process in the old session** (`caffeinate -i npx tsx scripts/soak.ts`). **Clearing the session
  will probably kill it, and it also stops if the Mac sleeps.** Restart (the log is append-only, so it resumes cleanly):
  ```
  SOAK_URL=https://stocklens-beryl.vercel.app/api/spike SOAK_INTERVAL_MIN=2 SOAK_MIN_HOURS=3 caffeinate -i npx tsx scripts/soak.ts
  ```
  Read the verdict any time: `npx tsx scripts/soak.ts --report` (PLAN says 3+ days; the user wants speed, so a verdict is
  accepted after `SOAK_MIN_HOURS=3`; if it fails, Plan B in PLAN §3.6).
- Alternative that survives the Mac sleeping: a Vercel cron or a GitHub Action hitting the endpoint (not built).

## Real-data findings (also in PLAN.md, "Step 1 status")

1. Yahoo mixes percent units (`quote.dividendYield` 3.12 vs `summaryDetail.dividendYield` 0.0312). Contract = fractions.
2. LVMH "quarterly" time series has balance-sheet rows only (no revenue/profit/FCF) -> `reported_less_often`; use annual. Its `earningsHistory` is empty.
3. Yahoo keeps serving a past "next earnings" date; provider drops dates older than 2 days.
4. TSM: `financialData.financialCurrency` = TWD but the price target is USD; revenue estimates TWD, EPS estimates USD. Plausibility guard -> `currency_mismatch`.
5. ETFs (SPY): financialData / earnings / recommendation / calendar modules throw; time series empty -> `not_applicable_for_type`.
6. Large daily moves can be real (Toyota +16.7 % on earnings day).

## Open items

**Needs the user (accounts / decisions)**
- [ ] Connect Vercel <-> GitHub (optional; auto-deploy on push).
- [ ] Provision Upstash (when Step 2 needs the shared cache).
- [ ] Create Gemini API key, note real RPM/RPD (before Step 4).
- [ ] Settle PLAN §10: logo ownership + LICENSE (MIT?), club-code gate, curated "start here" tickers, lectures stay local, privacy-page sign-off.
- [ ] Say "go" for Steps 2 and 3 (agents start only when the user says so; propose each brief first).

**Mine / next session**
- [ ] Propose the two briefs: `data-engineer` (providers, normalisation + zod, 8 chart ranges, caching/lock/rate-limit with Upstash, `/api/search|stock|chart|health`, availability matrix, 15-parallel-request cold-start test) and `frontend-engineer` (home + search, stock page, cards, FR/EN, built on `tests/fixtures/contract/` through a `lib/data` fixtures-vs-live switch, first apple-ui polish pass).
- [ ] Untested assumption (PLAN §12): can a subagent drive the Chrome extension? Test once with a trivial brief, else fall back to Playwright.
- [ ] Tick off the Step 1 checklist in PLAN.md; delete `app/api/spike` once the soak verdict is in; add a `.vercelignore`/cron if the soak should outlive the Mac.
- [ ] Commit the pending `.gitignore` change (Vercel added `.vercel`); `CURRENT.md` itself is not yet committed.

## Gotchas learned this session

- `npx vercel` hung for minutes holding npm's cache lock (the user's `npx vercel login` then did nothing). Fixed by killing the stuck process and `npm i -g vercel`. Use the global `vercel` binary.
- `prettier --write .` reformatted `.claude/agents/*.md` (those changes are committed; harmless). `.claude` is now in `.prettierignore`. A `git checkout -- .claude` revert was blocked by the permission classifier, so don't try to discard changes.
- BSD `sed` chokes on `//` in replacements: use the Edit tool instead.
- `@types/node` had to be `^24` to satisfy vitest 5's peer range.
- The repo is public: no secrets, no `Lectures/`. Recorded Yahoo fixtures ARE committed (small, test data).
- Commit rule from the plan: commit/push only when the user approves; commit messages end with the `Co-Authored-By` attribution line.

## Update: soak now runs on GitHub Actions

`.github/workflows/soak.yml` runs every 5 minutes (and on demand) in the cloud, so it no longer depends on the Mac or this
session. A run fails if any of the 3 tickers returns non-200, so the run history is the log. Read the verdict:

```
gh run list --workflow soak.yml --limit 300 --json conclusion,createdAt \
  --jq '[.[] | select(.conclusion=="success" or .conclusion=="failure")] | {runs: length, failed: ([.[]|select(.conclusion=="failure")]|length), first: (last.createdAt), last: (first.createdAt)}'
```
Pass = failed/runs under 2 %. Failures show the response body in the run log. Delete the workflow and `app/api/spike`
after the verdict. (The local background soak from the first session is redundant now; ignore its log.)
