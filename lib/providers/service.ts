import "server-only";
import type {
  ChartRange,
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
import { ProviderError } from "./errors";
import { composeStock } from "./normalize/compose";
import { ok } from "./normalize/helpers";
import type { CoreBundle, DetailBundle, MarketDataProvider } from "./types";

export const CONTRACT_VERSION = "0.2.0" as const;

const MIN = 60;
const HOUR = 3600;
const DAY = 86400;

/**
 * Cache lifetimes (seconds). soft = fresh; stale = how long the old copy stays available for
 * serving (flagged `stale: true`) when Yahoo fails. Quote 30-60 s, fundamentals 12-24 h (PLAN §7).
 */
export const TTL = {
  core: { softTtl: 45, staleTtl: 3 * DAY },
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

export { ProviderError };
