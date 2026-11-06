import type { GlossaryTermId, Thesis } from "@/lib/contract";

/** Term ids with a label in `messages` (`Stock.thesis.termsLabels`); a newer id is skipped, not shown raw. */
export const GLOSSARY_IDS = [
  "eps",
  "pe",
  "forward_pe",
  "market_cap",
  "dividend_yield",
  "payout_ratio",
  "free_cash_flow",
  "operating_margin",
  "revenue_growth",
  "analyst_target",
  "beta",
  "margin_of_safety",
  "circle_of_competence",
] as const satisfies readonly GlossaryTermId[];

/** Seconds -> the unit a student reads ("in about 3 hours"). Null when the server gave no hint. */
export function retryHint(
  seconds: number | undefined,
): { unit: "minutes" | "hours"; count: number } | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0)
    return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 90) return { unit: "minutes", count: minutes };
  return { unit: "hours", count: Math.round(minutes / 60) };
}

/** A short quota wait (a per-minute limit) is worth a Try again button; a daily one is not. */
export const SHORT_WAIT_SECONDS = 5 * 60;

/** Model output is untrusted: keep only non-empty strings, whatever shape arrived. */
export function textList(list: unknown): string[] {
  return Array.isArray(list)
    ? list.filter((s): s is string => typeof s === "string" && s.trim() !== "")
    : [];
}

export function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export const hasColumns = (t: Thesis) =>
  [t.bullCase, t.bearCase, t.holdCase].some((l) => textList(l).length > 0);
