/**
 * Every tunable of the AI layer, in ONE file (PLAN §3.5: free-tier model lists and quotas change
 * often). Pure constants, no secrets, safe to import anywhere on the server.
 */

/** Tried in order. The first that answers with an acceptable thesis wins. Confirm in AI Studio (Step 4b). */
export const GEMINI_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
] as const;

export const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta";

export const AI_CONFIG = {
  /** Low on purpose: the text must stay close to the supplied facts. */
  temperature: 0.3,
  maxOutputTokens: 2048,
  /** One HTTP call to Gemini. The route has `maxDuration`, so the whole chain must fit inside it. */
  requestTimeoutMs: 20_000,
  /** The whole fallback chain, including retries. */
  totalBudgetMs: 50_000,
  /** Same model again after a refused answer (schema/integrity), with the reason spelled out. */
  retriesPerModel: 1,
  /** A generation is reused this long, then regenerated (the plan says one per ticker/language/day). */
  softTtlSeconds: 20 * 3600,
  /** If regenerating fails, the last text is still served (flagged stale) for this long. */
  staleTtlSeconds: 7 * 86400,
  /**
   * Our own ceiling on generations per UTC day, below Google's. PLACEHOLDER until Step 4b records the
   * real requests-per-day from AI Studio (PLAN §3.5). Cache hits do not count.
   */
  dailyGenerationBudget: 150,
  /** After a 429 that names a per-minute limit, do not call Gemini again for this long. */
  quotaCooldownSeconds: 60,
  /** After a 429 that names a per-day limit. */
  dailyQuotaCooldownSeconds: 30 * 60,
  /** The AI endpoint has its own, much lower, per-IP ceiling (it must not be an open quota burner). */
  ratePerMinutePerIp: 20,
} as const;

/** Bounds on the text the model returns (also sent to Gemini in the response schema). */
export const THESIS_LIMITS = {
  paragraphMax: 600,
  pointMax: 280,
  casePoints: { min: 2, max: 3 },
  listPoints: { min: 2, max: 3 },
} as const;
