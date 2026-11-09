# CURRENT.md: session handoff

Rewritten 2026-11-07 when Step 6 started (the earlier layered notes were stale). `PLAN.md` is the full plan, `STEPS.md` the per-step
detail and status. This file is only "where are we right now".

## Next session: start with 6g

See **"6g: deploy and class dry run"** at the bottom of `STEPS.md`: deploy (production is behind `main`), pre-warm the AI the morning of class, write and run the 15-client dry run,
then the final apple-ui polish and the sign-offs. Ask the user before deploying, spending AI quota, or committing.

## State

- **Steps 1 to 5 are built, committed and deployed.** `npm run check` green (927 tests). `main` is ahead of production: 6a to 6f are pushed but not deployed.
- **Step 6 (hardening, QA, launch) is in progress**, see the bottom of `STEPS.md`. 6a (soak: **pass**, 270/0, spike removed), 6b (stale mode, incl. a real outage drill) and 6c (ticker matrix) are done as of 2026-11-09. 6e (README) and the 6f code review are done (9 of 10 findings fixed, club-code gate documented). Left: the final apple-ui polish, 6g deploy and the 15-tab dry run.
- Production: **https://stocks-lens.vercel.app** (live data mode, region `cdg1`). `stocklens-beryl.vercel.app` is an old alias that
  now 307-redirects to it. Deploy by hand: `vercel deploy --prod --yes` (Vercel-GitHub auto-deploy is not connected).
- Contract: market data `0.3.1`, AI endpoint `0.4.0`. AI is a multi-provider chain (Gemini, Groq, Gemma), keys are on Vercel.
- `/api/health` is `ok` for Yahoo, Upstash (provisioned via the Vercel Marketplace, `KV_REST_API_*` on Vercel) and Gemini, checked 2026-11-09.

## Still the user's (do not do these for them)

- **Start here list**: built (`lib/education/start-here.ts`, 9 US tech names plus the original three); the professor still reviews the "why" lines. Run `npm run ai:prewarm` before class (it spends AI quota, and it defaults to the start-here list).
- **The professor's review** of all FR/EN copy (list in `STEPS.md` 5d) and sign-off of the Privacy/Terms page.
- Settle PLAN §10: LICENSE and logo ownership, lectures stay local, and the **club-code gate** (it has no entry page in the UI, so `CLUB_CODE` must stay empty until one is built).
- `Assets/` changes (original logo moved, `Assets/Animation/`, `Assets/Default.png`) and `next-env.d.ts`: **never commit without asking**.

## Links and accounts

| Thing                | Value                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| GitHub repo (public) | https://github.com/Sami-Siala/StockLens (git user `Sami-Siala`, `gh` logged in, https); secret scanning on     |
| Vercel               | project `stocklens`, scope `stock-lens2`, Hobby, `cdg1` via `vercel.json`; CLI is global (`vercel`, not `npx`) |
| `.env.local`         | exists, git-ignored, holds `VERCEL_OIDC_TOKEN` and the AI keys. Never commit, never paste                      |
| AI limits            | `gemini-3.6-flash` = 20 requests/day free; Groq ~1000/day per model; budget guard 150 (PLAN §3.5)              |

## Working method

- The orchestrator (main session) owns config, deploys and git. `data-engineer` / `frontend-engineer` agents start only when the user says so
  and never commit. A subagent cannot drive the Chrome extension: use Playwright or a CDP script in the scratchpad.
- Commit only when the user approves; commit messages end with the `Co-Authored-By` line from the session reminder.
- AGENTS.md: this Next.js (16.4.5) differs from training data, read `node_modules/next/dist/docs/` before writing Next code.

## Gotchas

- `npx vercel` can hang on npm's cache lock; use the global binary.
- BSD `sed` chokes on `//` in replacements: use the Edit tool.
- `@types/node` must be `^24` for vitest 5. `prettier --write .` once reformatted `.claude/agents` (now in `.prettierignore`).
- The repo is public: no secrets, no `Lectures/`. Recorded Yahoo fixtures are committed on purpose.
- Real-data findings (percent units, semi-annual reporters, past earnings dates, TSM currencies, ETFs) are in PLAN §11 "Step 1 status" and
  encoded in the contract and tests.
