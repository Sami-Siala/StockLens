import type { IsoTimestamp } from "./common";

/**
 * AI thesis (Step 4, contract v0.4.0, ADDITIVE). `GET /api/ai/[symbol]?lang=fr|en`.
 *
 * Rules the UI can rely on:
 *  - Every string is PLAIN TEXT. Never render it as HTML or markdown.
 *  - Numbers inside the text were rendered by the server from the same data as the page
 *    (the model only wrote `{{metric_id}}` placeholders), so they match the cards.
 *  - Buy / Hold / Sell are ARGUMENTS to evaluate, never advice. The UI shows the disclaimer.
 *  - An unavailable AI is a normal 200 answer (`status: "unavailable"`), not an error: the stock
 *    page must keep working without it.
 */

export type AiLanguage = "fr" | "en";

/** Glossary ids a thesis may reference (Step 5 owns the definitions; the UI can link them). */
export type GlossaryTermId =
  | "eps"
  | "pe"
  | "forward_pe"
  | "market_cap"
  | "dividend_yield"
  | "payout_ratio"
  | "free_cash_flow"
  | "operating_margin"
  | "revenue_growth"
  | "analyst_target"
  | "beta"
  | "margin_of_safety"
  | "circle_of_competence";

export interface Thesis {
  /** "Explain it like I'm 15": what the company does. */
  whatItDoes: string;
  howItMakesMoney: string;
  /** 2 to 3 short arguments each. */
  bullCase: string[];
  bearCase: string[];
  holdCase: string[];
  keyRisks: string[];
  whatToWatch: string[];
  glossaryTerms: GlossaryTermId[];
}

export type AiUnavailableReason =
  /** No Gemini key configured on the server. */
  | "no_key"
  /** The free-tier quota (per minute or per day) is used up, or our own daily budget is. */
  | "quota_exhausted"
  /** Every model failed, timed out, or returned something we refused to show. */
  | "model_error"
  /** ETFs, indices, currencies, crypto... have no company to explain. */
  | "not_applicable_for_type"
  /** The company has too little data for a grounded thesis (we never let the model guess). */
  | "insufficient_data";

export interface ThesisMeta {
  contractVersion: "0.4.0";
  language: AiLanguage;
  /** Model that wrote the text; null when nothing was generated. */
  model: string | null;
  /** When the text was generated (not when it was served). */
  generatedAt: IsoTimestamp | null;
  /** True when an older generation is served because a fresh one failed. */
  stale: boolean;
}

export type ThesisResult =
  | { status: "ready"; thesis: Thesis }
  | {
      status: "unavailable";
      reason: AiUnavailableReason;
      /** Seconds, when the reason is a temporary quota. */
      retryAfter?: number;
    };

export interface ThesisResponse {
  meta: ThesisMeta;
  symbol: string;
  result: ThesisResult;
}
