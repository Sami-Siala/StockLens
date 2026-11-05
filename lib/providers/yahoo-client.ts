import "server-only";
import YahooFinance from "yahoo-finance2";
import { ExtendedCookieJar } from "yahoo-finance2/lib/cookieJar";
import type { KeyValueStore } from "./cache/types";
import { ProviderError, safeMessage } from "./errors";

/**
 * Our own narrow view of yahoo-finance2. Everything returns `unknown` on purpose: the library's
 * validation is OFF (`validateResult: false`), and OUR zod schemas (schemas.ts) own the shapes.
 * Tests inject a fake implementing this interface and replay recorded fixtures.
 */
export interface YahooClient {
  quote(symbol: string): Promise<unknown>;
  /**
   * ONE upstream call for many symbols (quote() accepts an array). Returns the raw array;
   * Yahoo silently omits symbols it does not know.
   */
  quotes(symbols: string[]): Promise<unknown>;
  quoteSummary(symbol: string, modules: readonly string[]): Promise<unknown>;
  fundamentalsTimeSeries(
    symbol: string,
    opts: { period1: Date; type: "quarterly" | "annual" },
  ): Promise<unknown>;
  chart(
    symbol: string,
    opts: { period1: Date; interval: string; includePrePost: boolean },
  ): Promise<unknown>;
  search(query: string): Promise<unknown>;
}

/** Honest, explicit UA. Keeps the "Mozilla/5.0 (compatible; ...)" shape that Yahoo accepts. */
export const USER_AGENT =
  "Mozilla/5.0 (compatible; StockLens/0.1; +https://github.com/Sami-Siala/StockLens)";

const JAR_KEY = "yahoo:cookiejar";
const JAR_TTL_SECONDS = 6 * 3600;
const OPTS = { validateResult: false } as const;

function mapError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  const name = e instanceof Error ? e.name : "";
  const msg = safeMessage(e);
  if (
    name === "NotFoundError" ||
    /not found|no data found|delisted|no fundamentals/i.test(msg)
  )
    return new ProviderError("not_found", msg);
  return new ProviderError("upstream", msg);
}

/**
 * The real client. The Yahoo cookie + crumb live in a tough-cookie jar (the crumb is stored in
 * it under a fake URL). Re-fetching them on every serverless cold start is a main trigger of
 * 429s, so the serialized jar is persisted in the shared store and restored on cold start.
 */
export function createYahooClient(
  store: KeyValueStore,
  opts: { timeoutMs?: number; fetch?: typeof fetch } = {},
): YahooClient {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const jar = new ExtendedCookieJar();
  const yf = new YahooFinance({
    suppressNotices: ["yahooSurvey"],
    versionCheck: false, // the default makes an extra network call on every error
    cookieJar: jar,
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
    fetchOptions: { headers: { "User-Agent": USER_AGENT } },
    validation: { logErrors: false, logOptionsErrors: false },
  });

  let hydrated: Promise<void> | null = null;
  let lastPersisted = "";
  let lastPersistedAt = 0;

  const hydrate = () =>
    (hydrated ??= (async () => {
      try {
        // Stored as an OBJECT: Upstash JSON-parses string values it reads back.
        const saved = await store.get<object>(JAR_KEY);
        if (saved && typeof saved === "object") {
          jar._importCookiesSync(saved);
          lastPersisted = JSON.stringify(saved);
          lastPersistedAt = Date.now();
        }
      } catch {
        /* a bad blob just means we fetch a fresh crumb */
      }
    })());

  const persist = async () => {
    try {
      const serialized = await jar.serialize();
      const json = JSON.stringify(serialized);
      const stale = Date.now() - lastPersistedAt > (JAR_TTL_SECONDS * 1000) / 3;
      if (json !== lastPersisted || stale) {
        await store.set(JAR_KEY, serialized, JAR_TTL_SECONDS);
        lastPersisted = json;
        lastPersistedAt = Date.now();
      }
    } catch {
      /* persistence is an optimisation, never a failure */
    }
  };

  async function call<T>(fn: () => Promise<T>): Promise<T> {
    await hydrate();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(new ProviderError("upstream", "Yahoo request timed out")),
            timeoutMs,
          );
        }),
      ]);
      await persist();
      return result;
    } catch (e) {
      throw mapError(e);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    quote: (symbol) =>
      call(() => yf.quote(symbol, {}, OPTS) as Promise<unknown>),
    quotes: (symbols) =>
      call(() => yf.quote(symbols, {}, OPTS) as Promise<unknown>),
    quoteSummary: (symbol, modules) =>
      call(
        () =>
          yf.quoteSummary(
            symbol,
            { modules: [...modules] as never },
            OPTS,
          ) as Promise<unknown>,
      ),
    fundamentalsTimeSeries: (symbol, o) =>
      call(
        () =>
          yf.fundamentalsTimeSeries(
            symbol,
            { period1: o.period1, type: o.type, module: "all" },
            OPTS,
          ) as Promise<unknown>,
      ),
    chart: (symbol, o) =>
      call(
        () =>
          yf.chart(
            symbol,
            {
              period1: o.period1,
              interval: o.interval as never,
              includePrePost: o.includePrePost,
            },
            OPTS,
          ) as Promise<unknown>,
      ),
    search: (query) =>
      call(
        () =>
          yf.search(
            query,
            { quotesCount: 10, newsCount: 0 },
            OPTS,
          ) as Promise<unknown>,
      ),
  };
}
