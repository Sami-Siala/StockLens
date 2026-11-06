/**
 * Every tunable of the AI layer, in ONE file (PLAN §3.5: free-tier model lists and quotas change
 * often). Pure constants, no secrets, safe to import anywhere on the server.
 */

/** The whole chain, Gemini API and Groq models mixed. Tried in order. The first that answers with an acceptable thesis wins. Verified to exist on the live API 2026-11-06. */
export const GEMINI_MODELS = [
  "gemini-3.6-flash",
  // `groq:` entries go to Groq (free tier, own quota: 1000 requests/day per model, 8000 tokens/minute).
  "groq:openai/gpt-oss-120b",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "groq:qwen/qwen3.8-27b",
  // groq:openai/gpt-oss-20b left out: failed the integrity gate in EN and FR (2026-11-06).
  // Last resort, same Gemini key, own quota. Measured 2026-11-06: 30 s+ per answer and flaky, so it only
  // runs when everything above is spent. (gemma-4-26b-a4b-it timed out twice: left out.)
  "gemma-4-31b-it",
] as const;

export const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta";

export const AI_CONFIG = {
  /** Low on purpose: the text must stay close to the supplied facts. */
  temperature: 0.3,
  maxOutputTokens: 8192,
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
   * Our own ceiling on generations per UTC day, below the providers'. Free-tier limits measured
   * 2026-11-06: gemini-3.6-flash 20 requests/day; Groq 1000 requests/day per model (8000 tokens/minute).
   * Spent models are skipped, so this guard only stops a runaway: 150 (ticker, language) pairs a day is far
   * more than a class needs. Cache hits do not count. Pre-warm the common tickers before class.
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
