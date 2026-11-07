# StockLens design notes

Owner: `frontend-engineer`. The product decisions live in `PLAN.md` §4.2; this file holds the
design rules the UI is built and polished against, so the project does not depend on the
`apple-ui` skill (which lives in a home folder, not in this repo).

## Source of the rules

Adapted from the `apple-ui` skill (Apple HIG: clarity, deference, depth) for the **web**. Its
Tkinter / SwiftUI specifics are ignored; its principles apply. **Where it conflicts with the plan,
the plan wins on product decisions** (e.g. the logo gradient stays the single accent); **the rules
below win on spacing, typography and hierarchy.**

## Rules

- **Clarity / deference / depth.** Content leads, chrome recedes. No decoration that does not
  serve a function. If unsure an element earns its place, remove it and see what is lost.
- **Spacing:** one 8 px grid. Allowed steps: 8, 12, 16, 24, 32 (and 4 for tight icon gaps). Related
  things sit closer than unrelated groups; separate groups with space, not divider lines.
- **Typography:** system font stack only (`--font-sans` in `app/globals.css`), no webfonts.
  Max 3 weights: muted labels, body/values, one larger semibold title per screen.
  **Tabular figures everywhere** (already set on `body`), so prices do not jitter.
- **Color:** neutral canvas from tokens (`--background`, `--surface`, `--border`, `--foreground`,
  `--muted`). **One accent: the logo gradient** (`--brand-gradient`, orange `#f89349` ->
  magenta `#e36092` -> purple `#982ef8`), used sparingly: primary button, active range pill,
  focus ring, brand marks. Never as large decorative backgrounds.
- **Up / down** are never colour-only: always pair `--positive` / `--negative` with an arrow icon.
- **One primary action per view**, visually dominant. Everything else is quieter.
- **Alignment:** labels and values share a grid, no eyeballed offsets.
- **Feedback:** loading, error, empty and "not available" states get a calm, specific, inline
  message in the app's own voice (FR and EN), never a raw exception or a bare "Error".
  Each card fails alone: one missing Yahoo field never breaks the page.
  `Metric.reason` (see `lib/contract/common.ts`) maps to a human sentence per reason.
- **Sizing:** mobile-first (390 px first, then 1280 px). No clipped text at the default size.
- **Dark mode:** supported from day one through the tokens (`prefers-color-scheme`). No
  hardcoded light-only colours. The wordmark has a light variant (`public/brand/wordmark-light.*`).
- **Restraint** over ornament.

## Self-critique checklist (run before calling a polish pass done)

- Is there exactly one obvious primary action?
- Is spacing consistent (same base unit) everywhere touched?
- Is more than one saturated / custom colour doing decorative work? If so, cut it.
- Would it look at home in a first-party Apple app? If it looks like a generic cross-platform
  utility, it is not done.
- Did the pass avoid touching business logic, network code, or anything not visual?

## Brand assets

| File                                                    | Use                                                |
| ------------------------------------------------------- | -------------------------------------------------- |
| `public/brand/wordmark.{png,webp}`                      | Black wordmark, transparent, for light backgrounds |
| `public/brand/wordmark-light.{png,webp}`                | White wordmark, for dark mode                      |
| `public/brand/mark.png`                                 | The gradient "o" mark alone                        |
| `app/icon.png`, `app/apple-icon.png`, `app/favicon.ico` | Generated from the mark                            |

Source: `Assets/*.png` (already has a transparent background). Sampled gradient stops:
`#f89349` (left), `#e36092` (top), `#d747c8`, `#982ef8` (right).
Open question (PLAN §10 Q10): confirm you own the logo and choose a LICENSE before this repo goes public.

## Decisions made while building Step 3 (do not re-litigate)

- **Accent fill is orange -> magenta -> pink only, with near-black text** (`--accent-fill`,
  `--on-accent`). White text on the orange end is 2.3:1 (fails WCAG AA); near-black passes on every
  stop. The purple end of the logo gradient stays for the focus ring and small brand marks (the
  "current price" dot on the price-target bar). Used on: primary button, active range pill.
- **Explain is an inline disclosure, not a floating tooltip** (works with touch, keyboard, screen readers).
- **Funds / ETFs** show one calm note instead of six identical "not available" cards.
- **Tokens only**: no pixel values in components except data-driven widths on the rating and
  price-target bars. Spacing steps used: 4 (icon gaps), 8, 12, 16, 24, 32.
- Rating colours (green / grey / red) are semantic and always paired with an arrow or dash icon and a text label.
- Screenshots are taken through headless Chrome (CDP, device metrics 390 and 1280, light and dark
  emulated), see the report of Step 3. No Chrome-extension access from a subagent.

## Polish-pass log

| Pass | Date       | What changed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Next target                                                                                                                                                                                                                                                                                                              |
| ---- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | 2026-11-05 | Highest-impact gap was hierarchy in the header: "USD 343.53" had the currency as loud as the number. Now the number is large and the currency code is small and muted next to it. Also: shorter search placeholder / button (were truncated at 390 px), balanced the home tagline, FR range labels shortened (1h 1j 1s 1m 1a 3a 5a) so they no longer wrap.                                                                                                                                                                                                                                                                               | Card rhythm on the stock page (uneven card heights in a row); compact big-number units in French ("Bn" is a true billion but students may read it as English); tooltip for the ticker anatomy                                                                                                                            |
| 2    | 2026-11-05 | Home dashboard. Highest-impact gap: the Markets tile took ~600 px of the phone screen (each index cell stacked label, level, change, sparkline, delay), pushing "Start here" far below the fold. The sparkline now sits beside level and change (cells ~110 px, tile ~170 px shorter), the unit never wraps (`whitespace-nowrap`, the sparkline shrinks first), and the kind chip appears only on gold (the one item that would mislead as "spot"); other labels wrap instead of truncating ("US 10-year yield"). Desktop: two independent stacks (lists left, glanceable tiles right) so no tile is stretched to its neighbour's height. | Tile titles and hints are all the same weight/size: try a lighter hint colour step on phones; filled watchlist rows with long legal names truncate ("Taiwan Semicondu..."): consider the short name from `QuoteLite`; Learn / Assignment placeholders can collapse to one row once they carry content.                   |
| 3    | 2026-11-06 | AI thesis section (Step 4c). Highest-impact gap: at 390 px the section header stacked three lines (title, stale badge, a "Written by an AI" label detached from the card) and said the same thing as the card's own footnote. The label is gone; the sparkle icon now leads the footnote ("Written by an AI ... Educational content, not financial advice") inside the card. Also: skeleton lines use `bg-background` so they show on the grey card; icon aligned to the first line of a wrapped title.                                                                                                                                   | Columns are body-size text in three narrow columns on desktop (long): try `text-sm` in the columns only; check dark mode on a real device (not emulable from the Chrome extension); the arguments title and the Analysts section intro both carry an "arguments, not advice" sentence: keep one if they feel repetitive. |

## Home dashboard rules (Step 3b, do not re-litigate)

- **Tiles**: gray `--surface` panel, `p-4` (phone) / `p-6` (sm+), title + one-line hint, body inside its own `CardBoundary`. No divider lines inside a tile: rows are separated by 16 px of space.
- **Only one gradient object on the page**: the Search button. Sparklines are neutral (`--muted`); up / down colour only on the change figure, always with an arrow and an sr-only word.
- **Index strip**: indices and FX have no currency; yields show the level in % and the change in percentage points (`pp` / `pt`, never percent); gold is a _future_ (chip), not spot.
- **Delay**: each row / index cell carries its own "Delayed N min" / "Real time" / "Last saved price" line. Exchange delay differs per exchange, so there is no single page-wide badge.
- **Phone order**: Markets, then Start here, then My watchlist when the watchlist is empty (a new visitor reads starters first); Watchlist before Start here once there is something in it. Done with `order-*` on `display: contents` wrappers (DOM order stays logical).
- **Degrade per row, per tile**: a failed symbol only changes its own row; a failed batch keeps names and shows one message with "Try again"; Start here is static and never blank.
- **Refresh**: 60 s, only while the tab is visible, off with `prefers-reduced-motion` (manual "Refresh" stays). Data stays on screen during a refresh (no skeleton flash).
- **Dev-only fixture switches** (fixtures mode only): `/?fixture=open`, `?fixture=degraded`, `?fixture=down`.

## Market ticker band (Step 3c, do not re-litigate)

- **One slim band (32 px, hairline bottom border) directly under the header on every page**, wired through `PageShell`. It is quiet on purpose: 12 px type, muted labels, level in the foreground colour, change with the arrow (the only coloured thing; `--positive` / `--negative`, never colour alone). **No gradient accent** here.
- **Loop**: the list is drawn twice (more when the window is wider than one list); the copy is `aria-hidden`. The track slides left by exactly one list width, so the wrap has no seam (checked: the frame at 0 and at the end of the cycle match). Duration = measured list width / 44 px/s (~118 s for the 24 items), so the speed is the same on phone and desktop. A refresh that changes the width by under 10 % keeps the old duration (changing it mid-flight would make the track jump).
- **Pause**: hover (real pointers only), keyboard focus on the band (it is one tab stop), a finger held on it, a hidden tab.
- **Reduced motion**: no animation; the band is one static strip with `overflow-x: auto` (the duplicate list is `display: none`), a fade only on the right edge.
- **Data**: unavailable items are skipped (no dashes); a stale item keeps its last value plus a small clock icon (and an sr-only "Last saved value"); fewer than 4 usable items or a failed request hides the band completely. The band eases in once per page load (after the splash), later pages mount it already in place, so there is no layout jump.
- **One request**: `lib/data/ticker-store.ts` is a module-level store shared by every mounted band (one `/api/ticker`, then at most one per ~60 s, never while the tab is hidden, a failed refresh keeps the numbers). Navigating between pages does not refetch.
- Tried, not kept: a `title` tooltip on the band (noisy over a moving strip; the note is sr-only instead).
- Next target: on phones the band plus header take ~104 px before the page content; if that feels heavy, drop the header's own bottom padding on the home page.

## AI thesis rules (Step 4c, do not re-litigate)

- **Plain text only.** Every model string is a React text node. No HTML, no markdown, no raw-markup injection (a test proves `<b>` and `**x**` stay literal).
- **Two sections, one request**: "The company in 30 seconds" right after the chart (it is also where every non-ready state shows its calm card); arguments for / against / for waiting after the analysts section, then risks, what to watch, plain term chips, and the persistent notice.
- **Columns are neutral grey cards.** Green / red only on a small trend icon next to a text title; the wait column is muted. The gradient is not used here.
- **Never blocks the page.** The request starts only once the company exists (typos must not spend quota), `?hideAI=1` removes the sections and the request, each section sits in its own `CardBoundary`.
- **Retry** only where it can help: model_error, transport error, quota with a wait of 5 min or less. Not for no_key, insufficient_data, not_applicable, or a daily quota.
- **Dev-only fixture switch** (fixtures mode): `?aiState=ready|stale|markup|no_key|quota_exhausted|model_error|not_applicable_for_type|insufficient_data|loading|down`. Defaults: SPY not applicable, RIVN insufficient data, AAPL ready, other fixture tickers a short figure-free sample.

## Step 5b notes (Your turn, class links)

- "Your turn": the selected Buy/Hold/Sell pill is neutral (foreground fill + check icon), not the accent:
  the accent stays on the one primary action of a view and on active range pills.
- Class page: students see the list and no primary button; the teacher builder is a collapsed `details`
  (open only when the link is empty) whose single primary action is "Copy the link". The builder search
  uses the compact field (no second primary button) with a `bg-background` field on the `bg-surface` card.
- Inputs that are typed into use `text-base` (16 px) so iOS does not zoom on focus.

## Step 5c notes (quiz, margin of safety, one-page export; do not re-litigate)

- Stock page order: ... analysts, AI arguments, **Test yourself**, **Margin of safety**, **Your turn**, **One-page summary**. Four neutral `bg-surface` cards; no accent anywhere in them
  (no primary button: nothing here is "the" action; Print and Copy are quiet secondary pills).
- Quiz: answer state is shape + weight + icon (check on the right answer, a cross on a wrong pick, 2 px outline), never red/green. No score, no timer. "Next question" is a secondary pill on `bg-background` (on a `bg-surface` card the default secondary vanishes).
- Margin of safety: one big figure (the margin, signed), one sentence, one quiet second line; the input is text with `inputMode="decimal"` (a `type=number` field breaks the French decimal comma).
- Print: the stock page prints ONLY the summary sheet (`print:hidden` on the screen content, `body > :not(main)` hidden, light tokens forced in `@media print` so dark mode prints black on white). AI arguments are capped at 2 per column so the sheet stays one Letter (EN) / A4 (FR) page.
- Polish pass 1: a wrong pick's outline used the border token and was invisible in dark mode; it now uses `--muted`. Next target: the stock page is long on a phone (quiz, margin, notes, export stack); if it feels heavy, fold the quiz and margin cards into `details` once the first view of each is understood.
