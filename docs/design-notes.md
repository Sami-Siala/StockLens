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

| Pass | Date       | What changed                                                                                                                                                                                                                                                                                                                                                | Next target                                                                                                                                                                                   |
| ---- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 2026-11-05 | Highest-impact gap was hierarchy in the header: "USD 343.53" had the currency as loud as the number. Now the number is large and the currency code is small and muted next to it. Also: shorter search placeholder / button (were truncated at 390 px), balanced the home tagline, FR range labels shortened (1h 1j 1s 1m 1a 3a 5a) so they no longer wrap. | Card rhythm on the stock page (uneven card heights in a row); compact big-number units in French ("Bn" is a true billion but students may read it as English); tooltip for the ticker anatomy |
