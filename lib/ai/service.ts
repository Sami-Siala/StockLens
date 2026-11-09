import "server-only";
import type {
  AiLanguage,
  AiUnavailableReason,
  HealthReport,
  ProviderStatus,
  StockSnapshot,
  Thesis,
  ThesisResponse,
} from "@/lib/contract";
import type { KeyValueStore } from "@/lib/providers/cache/types";
import {
  cachedFetch,
  type CacheDeps,
  type CachedResult,
} from "@/lib/providers/cached";
import { ProviderError } from "@/lib/providers/errors";
import { AI_CONFIG, GEMINI_MODELS } from "./config";
import { buildFacts, displayMap, substantiveFactCount } from "./facts";
import { GeminiError } from "./gemini";
import type { ThesisClient } from "./router";
import { checkThesis, renderThesis } from "./integrity";
import { retryNote, systemPrompt, userPrompt } from "./prompt";

/** A facts sheet needs at least this many facts about the business (not just the quote) to be worth a thesis. */
export const MIN_SUBSTANTIVE_FACTS = 3;

/**
 * What we cache per (symbol, language): the model's TEMPLATE (still holding `{{id}}` placeholders)
 * and the numbers as they were at generation time. Numbers are rendered when the thesis is SERVED,
 * from the current stock data, so the text always matches the page. The stored numbers only fill
 * the gap if a metric has gone missing since.
 */
interface CachedThesis {
  template: Thesis;
  facts: Record<string, string>;
  model: string;
}

const REASONS: ReadonlySet<string> = new Set<AiUnavailableReason>([
  "no_key",
  "quota_exhausted",
  "model_error",
  "not_applicable_for_type",
  "insufficient_data",
]);

interface HealthRecord {
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  consecutiveFailures: number;
  lastError: string | null;
}

interface QuotaMarker {
  daily: boolean;
}

export interface AiServiceDeps {
  store: KeyValueStore;
  /** The same cached stock snapshot the page shows (so the numbers cannot disagree). */
  getStock: (symbol: string) => Promise<StockSnapshot>;
  /** null = no key configured. */
  gemini: ThesisClient | null;
  models?: readonly string[];
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  cache?: Pick<CacheDeps, "waitMs" | "pollMs" | "lockTtlSeconds">;
}

const unavailable = (
  language: AiLanguage,
  symbol: string,
  reason: AiUnavailableReason,
  retryAfter?: number,
): ThesisResponse => ({
  meta: {
    contractVersion: "0.4.0",
    language,
    model: null,
    generatedAt: null,
    stale: false,
  },
  symbol,
  result: {
    status: "unavailable",
    reason,
    ...(retryAfter ? { retryAfter } : {}),
  },
});

/** The company explainer + bull/bear/hold thesis: grounded, cached, coalesced, and never a hard failure. */
export class AiService {
  private inflight = new Map<string, Promise<CachedResult<unknown>>>();
  private now: () => number;
  private sleep: (ms: number) => Promise<void>;
  private models: readonly string[];

  constructor(private deps: AiServiceDeps) {
    this.now = deps.now ?? Date.now;
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.models = deps.models ?? GEMINI_MODELS;
  }

  private cacheDeps(): CacheDeps {
    return {
      store: this.deps.store,
      now: this.now,
      sleep: this.sleep,
      inflight: this.inflight,
      // A generation can take a while: the lock outlives the whole fallback chain, and
      // waiters (other students on other instances) wait about as long.
      lockTtlSeconds: Math.ceil(AI_CONFIG.totalBudgetMs / 1000) + 10,
      waitMs: AI_CONFIG.totalBudgetMs,
      pollMs: 400,
      ...this.deps.cache,
      onUpstream: (ok, error) => void this.recordHealth(ok, error),
    };
  }

  private async recordHealth(ok: boolean, error?: string) {
    const key = "health:gemini";
    const prev = (await this.deps.store.get<HealthRecord>(key)) ?? {
      lastSuccessAt: null,
      lastFailureAt: null,
      consecutiveFailures: 0,
      lastError: null,
    };
    const next: HealthRecord = ok
      ? {
          ...prev,
          lastSuccessAt: this.now(),
          consecutiveFailures: 0,
          lastError: null,
        }
      : {
          ...prev,
          lastFailureAt: this.now(),
          consecutiveFailures: prev.consecutiveFailures + 1,
          lastError: error ?? "error",
        };
    await this.deps.store.set(key, next, 7 * 86400);
  }

  /**
   * Throws `ProviderError` only for the STOCK data (unknown ticker, Yahoo down): the route maps it
   * like any other route. Every AI problem is a normal `unavailable` answer.
   */
  async getThesis(
    symbol: string,
    language: AiLanguage,
  ): Promise<ThesisResponse> {
    const stock = await this.deps.getStock(symbol);
    const sym = stock.listing.symbol;

    if (stock.listing.quoteType !== "EQUITY")
      return unavailable(language, sym, "not_applicable_for_type");
    const sheet = buildFacts(stock, language);
    if (substantiveFactCount(sheet) < MIN_SUBSTANTIVE_FACTS)
      return unavailable(language, sym, "insufficient_data");

    let cached: CachedResult<CachedThesis>;
    try {
      cached = await cachedFetch<CachedThesis>(
        this.cacheDeps(),
        `ai:${sym}:${language}`,
        {
          softTtl: AI_CONFIG.softTtlSeconds,
          staleTtl: AI_CONFIG.staleTtlSeconds,
        },
        () => this.generate(sym, language, stock),
      );
    } catch (e) {
      const reason =
        e instanceof ProviderError && REASONS.has(e.message)
          ? (e.message as AiUnavailableReason)
          : "model_error";
      return unavailable(
        language,
        sym,
        reason,
        reason === "quota_exhausted" ? await this.quotaRetryAfter() : undefined,
      );
    }

    // Current numbers first, generation-time numbers only for gaps.
    const rendered = renderThesis(cached.data.template, {
      ...cached.data.facts,
      ...displayMap(sheet),
    });
    if (!rendered) return unavailable(language, sym, "model_error");
    return {
      meta: {
        contractVersion: "0.4.0",
        language,
        model: cached.data.model,
        generatedAt: new Date(cached.fetchedAt).toISOString(),
        stale: cached.stale,
      },
      symbol: sym,
      result: { status: "ready", thesis: rendered },
    };
  }

  private async quotaRetryAfter(): Promise<number> {
    const m = await this.deps.store.get<QuotaMarker>("ai:quota");
    return m?.daily
      ? AI_CONFIG.dailyQuotaCooldownSeconds
      : AI_CONFIG.quotaCooldownSeconds;
  }

  /** One real generation: runs under the cache lock, so 15 students cause exactly one of these. */
  private async generate(
    symbol: string,
    language: AiLanguage,
    stock: StockSnapshot,
  ): Promise<CachedThesis> {
    const fail = (reason: AiUnavailableReason): never => {
      throw new ProviderError("upstream", reason, "gemini");
    };
    const { gemini, store } = this.deps;
    if (!gemini) return fail("no_key");

    if (await store.get<QuotaMarker>("ai:quota"))
      return fail("quota_exhausted");
    const day = new Date(this.now()).toISOString().slice(0, 10);
    // 0 means the store is down: fail open (Google's own limit still protects us).
    const used = await store.increment(`ai:budget:${day}`, 2 * 86400);
    if (used > AI_CONFIG.dailyGenerationBudget) {
      // Same marker as a provider-side daily quota, so the UI is told the real wait and the
      // retries stop counting against the budget until the cooldown ends.
      await store.set(
        "ai:quota",
        { daily: true } satisfies QuotaMarker,
        AI_CONFIG.dailyQuotaCooldownSeconds,
      );
      return fail("quota_exhausted");
    }

    const sheet = buildFacts(stock, language);
    const ids = new Set(Object.keys(sheet.facts));
    const system = systemPrompt(language);
    const prompt = userPrompt(sheet);
    const deadline = this.now() + AI_CONFIG.totalBudgetMs;

    let everyModelQuota = true;
    let authFailures = 0;
    let attempted = 0;
    let dailyQuota = false;
    for (const model of this.models) {
      let problems: string[] = [];
      let lastWasQuota = false;
      // A model that already said "out of requests" is skipped until its cooldown ends: free-tier
      // limits are per model per day, and retrying a spent model only wastes time.
      const spent = await store.get<QuotaMarker>(`ai:quota:${model}`);
      if (spent) {
        dailyQuota ||= spent.daily;
        continue;
      }
      attempted++;
      for (let attempt = 0; attempt <= AI_CONFIG.retriesPerModel; attempt++) {
        if (this.now() >= deadline) return fail("model_error");
        const user = problems.length ? [prompt, retryNote(problems)] : [prompt];
        try {
          const raw = await gemini.generateJson({ model, system, user });
          const checked = checkThesis(raw, ids);
          if (checked.ok)
            return {
              template: checked.thesis,
              facts: displayMap(sheet),
              model,
            };
          problems = checked.problems;
          lastWasQuota = false;
        } catch (e) {
          if (!(e instanceof GeminiError)) throw e;
          if (e.kind === "auth") {
            // A bad or missing key spoils that provider's models only: another provider may still answer.
            authFailures++;
            lastWasQuota = false;
            break;
          }
          if (e.kind === "quota") {
            lastWasQuota = true;
            dailyQuota ||= e.daily;
            await store.set(
              `ai:quota:${model}`,
              { daily: e.daily } satisfies QuotaMarker,
              e.daily
                ? AI_CONFIG.dailyQuotaCooldownSeconds
                : AI_CONFIG.quotaCooldownSeconds,
            );
            break; // each model has its own quota: try the next one
          }
          lastWasQuota = false;
          if (e.kind === "unavailable") break; // timeout/5xx/404: another model may answer
          problems = [`the reply was unusable (${e.message})`]; // bad_reply: ask once more
        }
      }
      if (!lastWasQuota) everyModelQuota = false;
    }

    if (everyModelQuota) {
      await store.set(
        "ai:quota",
        { daily: dailyQuota } satisfies QuotaMarker,
        dailyQuota
          ? AI_CONFIG.dailyQuotaCooldownSeconds
          : AI_CONFIG.quotaCooldownSeconds,
      );
      return fail("quota_exhausted");
    }
    if (attempted > 0 && authFailures === attempted) return fail("no_key");
    return fail("model_error");
  }

  /** The Gemini line of /api/health. Never the overall status: the page works without the AI. */
  async health(): Promise<HealthReport["providers"][number]> {
    if (!this.deps.gemini)
      return {
        name: "gemini",
        status: "down",
        lastSuccessAt: null,
        detail: "AI key not configured: the AI thesis is unavailable",
      };
    const rec = await this.deps.store.get<HealthRecord>("health:gemini");
    const status: ProviderStatus =
      !rec || rec.consecutiveFailures === 0
        ? "ok"
        : rec.consecutiveFailures < 3
          ? "degraded"
          : "down";
    return {
      name: "gemini",
      status,
      lastSuccessAt: rec?.lastSuccessAt
        ? new Date(rec.lastSuccessAt).toISOString()
        : null,
      ...(rec?.lastError ? { detail: rec.lastError } : {}),
    };
  }
}
