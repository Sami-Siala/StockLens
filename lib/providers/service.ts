import "server-only";
import type {
  ChartRange,
  MarketResponse,
  Metric,
  QuoteEntry,
  QuoteLite,
  QuotesResponse,
  TickerResponse,
  ChartResponse,
  DataSource,
  HealthReport,
  ProviderStatus,
  ResponseMeta,
  SearchResponse,
  StockSnapshot,
} from "@/lib/contract";
import type { KeyValueStore } from "./cache/types";
import {
  cachedFetch,
  type CacheDeps,
  type CachePolicy,
  type CachedResult,
} from "./cached";
import { cachedBatch, type BatchOutcome } from "./cached-batch";
import { ProviderError, safeMessage } from "./errors";
import { composeStock } from "./normalize/compose";
import { miss, ok } from "./normalize/helpers";
import {
  attachSparkline,
  buildStatus,
  indexItem,
  liteFromCore,
  MARKET_SYMBOLS,
  MARKET_STRIP,
  sparklineMetric,
} from "./normalize/lite";
import { tickerItem } from "./normalize/ticker";
import { TICKER_SPECS, TICKER_SYMBOLS } from "./ticker-config";
import type { CoreBundle, DetailBundle, MarketDataProvider } from "./types";

export const CONTRACT_VERSION = "0.3.1" as const;

const MIN = 60;
const HOUR = 3600;
const DAY = 86400;

/**
 * Cache lifetimes (seconds). soft = fresh; stale = how long the old copy stays available for
 * serving (flagged `stale: true`) when Yahoo fails. Quote 30-60 s, fundamentals 12-24 h (PLAN §7).
 */
export const TTL = {
  core: { softTtl: 45, staleTtl: 3 * DAY },
  /** Index strip + status chips: one batch per ~60 s for the whole class. */
  market: { softTtl: 60, staleTtl: 3 * DAY },
  /** Ticker band: same `core:SYMBOL` entries, no sparklines, one batch per ~60 s. */
  ticker: { softTtl: 60, staleTtl: 3 * DAY },
  /** Dashboard sparklines: daily closes only change slowly, so much longer than the price. */
  spark: { softTtl: 30 * MIN, staleTtl: 7 * DAY },
  detail: { softTtl: 12 * HOUR, staleTtl: 7 * DAY },
  search: { softTtl: DAY, staleTtl: 7 * DAY },
  chart: {
    "1H": { softTtl: 60, staleTtl: 3 * DAY },
    "1D": { softTtl: 2 * MIN, staleTtl: 3 * DAY },
    "1W": { softTtl: 5 * MIN, staleTtl: 7 * DAY },
    "1M": { softTtl: 15 * MIN, staleTtl: 7 * DAY },
    "1Y": { softTtl: 30 * MIN, staleTtl: 7 * DAY },
    "3Y": { softTtl: 6 * HOUR, staleTtl: 14 * DAY },
    "5Y": { softTtl: 6 * HOUR, staleTtl: 14 * DAY },
    ALL: { softTtl: 12 * HOUR, staleTtl: 14 * DAY },
  } satisfies Record<ChartRange, CachePolicy>,
} as const;

interface HealthRecord {
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  consecutiveFailures: number;
  lastError: string | null;
}

export interface ServiceDeps {
  provider: MarketDataProvider;
  store: KeyValueStore;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Overrides for tests (poll interval, wait). */
  cache?: Pick<CacheDeps, "waitMs" | "pollMs" | "lockTtlSeconds">;
  /**
   * Dashboard sparklines: at most this many chart calls run at once, and no NEW chart call starts
   * after `sparklineBudgetMs` (those sparklines come back missing, never a slow page).
   */
  sparklineConcurrency?: number;
  sparklineBudgetMs?: number;
}

/** One symbol of a dashboard batch, resolved. */
interface LiteResult {
  status: QuoteEntry["status"];
  quote: Metric<QuoteLite>;
  stale: boolean;
  fetchedAt: number | null;
}

/** Orchestrates provider + cache + health and produces contract envelopes. */
export class DataService {
  private inflight = new Map<string, Promise<CachedResult<unknown>>>();
  private now: () => number;
  private sleep: (ms: number) => Promise<void>;
  private store: KeyValueStore;
  private provider: MarketDataProvider;

  constructor(private deps: ServiceDeps) {
    this.provider = deps.provider;
    this.store = deps.store;
    this.now = deps.now ?? Date.now;
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private cacheDeps(): CacheDeps {
    return {
      store: this.store,
      now: this.now,
      sleep: this.sleep,
      inflight: this.inflight,
      ...this.deps.cache,
      onUpstream: (okFlag, error) => void this.recordHealth(okFlag, error),
    };
  }

  private async recordHealth(okFlag: boolean, error?: string) {
    const key = `health:${this.provider.name}`;
    const prev = (await this.store.get<HealthRecord>(key)) ?? {
      lastSuccessAt: null,
      lastFailureAt: null,
      consecutiveFailures: 0,
      lastError: null,
    };
    const next: HealthRecord = okFlag
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
    await this.store.set(key, next, 7 * DAY);
  }

  private meta(
    fetchedAt: number,
    stale: boolean,
    degraded?: string[],
  ): ResponseMeta {
    return {
      contractVersion: CONTRACT_VERSION,
      source: this.provider.name as DataSource,
      fetchedAt: new Date(fetchedAt).toISOString(),
      stale,
      ...(degraded && degraded.length
        ? { degradedSections: degraded as ResponseMeta["degradedSections"] }
        : {}),
    };
  }

  async search(
    query: string,
  ): Promise<SearchResponse & { meta: ResponseMeta }> {
    const r = await cachedFetch(
      this.cacheDeps(),
      `search:${query.toLowerCase()}`,
      TTL.search,
      () => this.provider.search(query),
    );
    return { meta: this.meta(r.fetchedAt, r.stale), query, hits: r.data };
  }

  /**
   * Stock page data. The listing/quote bundle is required (without it there is nothing to
   * render); the detail bundle is optional and its absence degrades sections, not the page.
   */
  async getStock(symbol: string): Promise<StockSnapshot> {
    const deps = this.cacheDeps();
    const [core, detail] = await Promise.allSettled([
      cachedFetch<CoreBundle>(deps, `core:${symbol}`, TTL.core, () =>
        this.provider.getCore(symbol),
      ),
      cachedFetch<DetailBundle>(deps, `detail:${symbol}`, TTL.detail, () =>
        this.provider.getDetail(symbol),
      ),
    ]);
    if (core.status === "rejected") throw core.reason;
    const d = detail.status === "fulfilled" ? detail.value : null;
    const composed = composeStock(
      core.value.data,
      d?.data ?? null,
      new Date(this.now()),
    );
    const { degraded, ...sections } = composed;
    return {
      meta: this.meta(
        Math.min(core.value.fetchedAt, d?.fetchedAt ?? core.value.fetchedAt),
        core.value.stale || (d?.stale ?? false),
        degraded,
      ),
      ...sections,
    };
  }

  /**
   * Cached `core:SYMBOL` entries (shared with the stock page) for everything fresh, ONE batched
   * quote() for the rest (coalesced per key). Failures stay per symbol. No chart calls.
   */
  private coreBatch(symbols: string[], policy: CachePolicy) {
    return cachedBatch<CoreBundle>(
      this.cacheDeps(),
      symbols.map((s) => `core:${s}`),
      policy,
      async (keys) =>
        this.provider
          .getCores(keys.map((k) => k.slice("core:".length)))
          .then(
            (m) =>
              new Map([...m].map(([sym, v]) => [`core:${sym}`, v] as const)),
          ),
    );
  }

  /**
   * Dashboard batch: `coreBatch`, then one daily `chart()` per symbol whose sparkline is not
   * cached (30 min).
   */
  private async liteBatch(
    symbols: string[],
    policy: CachePolicy,
  ): Promise<Map<string, LiteResult>> {
    const deps = this.cacheDeps();
    const asOf = new Date(this.now());
    const cores = await this.coreBatch(symbols, policy);

    // Sparklines only for symbols that actually have a quote (no chart calls for unknown tickers).
    const live = symbols.filter((s) => {
      const o = cores.get(`core:${s}`);
      return o?.ok && o.value.data.quote.value !== null;
    });
    const sparks = await cachedBatch<number[]>(
      deps,
      live.map((s) => `spark:${s}`),
      TTL.spark,
      (keys) => this.fetchSparklines(keys),
    );

    const out = new Map<string, LiteResult>();
    for (const symbol of symbols) {
      const c = cores.get(`core:${symbol}`);
      if (!c || !c.ok) {
        const notFound = c && !c.ok && c.error.kind === "not_found";
        out.set(symbol, {
          status: notFound ? "not_found" : "unavailable",
          quote: miss(notFound ? "not_provided_by_source" : "provider_error"),
          stale: false,
          fetchedAt: null,
        });
        continue;
      }
      const base = liteFromCore(c.value.data, asOf);
      if (base.value === null) {
        out.set(symbol, {
          status: "unavailable",
          quote: miss(base.reason),
          stale: c.value.stale,
          fetchedAt: c.value.fetchedAt,
        });
        continue;
      }
      out.set(symbol, {
        status: "ok",
        quote: ok(
          attachSparkline(
            base.value,
            sparkMetric(sparks.get(`spark:${symbol}`)),
          ),
        ),
        stale: c.value.stale,
        fetchedAt: c.value.fetchedAt,
      });
    }
    return out;
  }

  private async fetchSparklines(
    keys: string[],
  ): Promise<Map<string, number[] | ProviderError>> {
    const out = new Map<string, number[] | ProviderError>();
    const limit = Math.max(1, this.deps.sparklineConcurrency ?? 6);
    const cutoff = this.now() + (this.deps.sparklineBudgetMs ?? 4000);
    const queue = [...keys];
    const at = new Date(this.now());
    const worker = async () => {
      for (let key = queue.shift(); key; key = queue.shift()) {
        if (this.now() > cutoff) {
          out.set(
            key,
            new ProviderError("upstream", "sparkline time budget used up"),
          );
          continue;
        }
        try {
          out.set(
            key,
            await this.provider.getSparkline(key.slice("spark:".length), at),
          );
        } catch (e) {
          out.set(
            key,
            e instanceof ProviderError
              ? e
              : new ProviderError("upstream", safeMessage(e)),
          );
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(limit, keys.length) }, worker),
    );
    return out;
  }

  /**
   * GET /api/quotes. `items` keeps the caller's order; invalid tickers are reported inline and
   * never reach Yahoo.
   */
  async getQuotes(
    items: Array<{ symbol: string; valid: boolean }>,
  ): Promise<QuotesResponse> {
    const lites = await this.liteBatch(
      items.filter((i) => i.valid).map((i) => i.symbol),
      TTL.core,
    );
    const entries: QuoteEntry[] = items.map((i) => {
      const r = i.valid ? lites.get(i.symbol) : undefined;
      return r
        ? { symbol: i.symbol, status: r.status, quote: r.quote, stale: r.stale }
        : {
            symbol: i.symbol,
            status: "invalid",
            quote: miss("not_provided_by_source"),
            stale: false,
          };
    });
    const times = [...lites.values()].flatMap((r) =>
      r.fetchedAt === null ? [] : [r.fetchedAt],
    );
    return {
      meta: this.meta(
        times.length ? Math.min(...times) : this.now(),
        entries.some((e) => e.stale),
      ),
      entries,
    };
  }

  /** GET /api/market: status chips + index strip from ONE cached batch (about 60 s). */
  async getMarket(): Promise<MarketResponse> {
    const lites = await this.liteBatch(MARKET_SYMBOLS, TTL.market);
    const refs = new Map<
      string,
      { quote: Metric<QuoteLite>; stale: boolean }
    >();
    const indices = MARKET_STRIP.map((spec) => {
      const r = lites.get(spec.symbol);
      const quote = r?.quote ?? miss<QuoteLite>("provider_error");
      refs.set(spec.symbol, { quote, stale: r?.stale ?? false });
      return indexItem(spec, quote, r?.stale ?? false);
    });
    const times = [...lites.values()].flatMap((r) =>
      r.fetchedAt === null ? [] : [r.fetchedAt],
    );
    return {
      meta: this.meta(
        times.length ? Math.min(...times) : this.now(),
        indices.some((i) => i.stale),
      ),
      status: buildStatus(refs, new Date(this.now())),
      indices,
    };
  }

  /**
   * GET /api/ticker: every configured index/macro symbol from the shared `core:SYMBOL` cache and
   * ONE batched quote() for whatever is not fresh. No sparklines, no chart calls. Items keep the
   * config order; a failed symbol is an inline `unavailable` item (or its stale copy).
   */
  async getTicker(): Promise<TickerResponse> {
    const cores = await this.coreBatch(TICKER_SYMBOLS, TTL.ticker);
    const at = new Date(this.now());
    const rows = TICKER_SPECS.map((spec) =>
      tickerItem(spec, cores.get(`core:${spec.symbol}`), at),
    );
    const times = rows.flatMap((r) =>
      r.fetchedAt === null ? [] : [r.fetchedAt],
    );
    return {
      meta: this.meta(
        times.length ? Math.min(...times) : this.now(),
        rows.some((r) => r.item.stale),
      ),
      items: rows.map((r) => r.item),
    };
  }

  async getChart(symbol: string, range: ChartRange): Promise<ChartResponse> {
    const r = await cachedFetch(
      this.cacheDeps(),
      `chart:${symbol}:${range}`,
      TTL.chart[range],
      () => this.provider.getChart(symbol, range, new Date(this.now())),
    );
    return { meta: this.meta(r.fetchedAt, r.stale), range, series: ok(r.data) };
  }

  async health(): Promise<HealthReport> {
    const rec = await this.store.get<HealthRecord>(
      `health:${this.provider.name}`,
    );
    const status: ProviderStatus =
      !rec || rec.consecutiveFailures === 0
        ? "ok"
        : rec.consecutiveFailures < 3
          ? "degraded"
          : "down";

    // Real round-trip to the store, so "upstash ok" means it actually answers.
    let storeOk = false;
    try {
      await this.store.set("health:ping", this.now(), 60);
      storeOk = (await this.store.get<number>("health:ping")) !== null;
    } catch {
      storeOk = false;
    }
    const isMemory = this.store.kind === "memory";
    const production = process.env.NODE_ENV === "production";
    const storeStatus: ProviderStatus = !storeOk
      ? "down"
      : isMemory && production
        ? "degraded"
        : "ok";

    const providers: HealthReport["providers"] = [
      {
        name: this.provider.name,
        status,
        lastSuccessAt: rec?.lastSuccessAt
          ? new Date(rec.lastSuccessAt).toISOString()
          : null,
        ...(rec?.lastError ? { detail: rec.lastError } : {}),
      },
      {
        name: "upstash",
        status: storeStatus,
        lastSuccessAt: storeOk ? new Date(this.now()).toISOString() : null,
        detail: isMemory
          ? "in-memory cache (Upstash not configured): not shared between serverless instances"
          : "Upstash Redis",
      },
    ];
    // Overall = what the UI should say about DATA: Yahoo's state, not the cache's.
    return {
      status,
      checkedAt: new Date(this.now()).toISOString(),
      providers,
    };
  }
}

function sparkMetric(o: BatchOutcome<number[]> | undefined): Metric<number[]> {
  if (!o) return miss("provider_error");
  if (o.ok) return sparklineMetric(o.value.data);
  return miss(
    o.error.kind === "not_found" ? "not_provided_by_source" : "provider_error",
  );
}

export { ProviderError };
