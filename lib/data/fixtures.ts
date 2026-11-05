/**
 * Fixture-backed data source (DEV / tests only; never bundled when NEXT_PUBLIC_DATA_MODE=live).
 * Reads the recorded contract fixtures. Only chart ranges 1W and 1Y were recorded, so the
 * other six ranges are cut from those two. They look right but are not the real intervals.
 */
import type {
  Candle,
  ChartRange,
  ChartResponse,
  ChartSeries,
  Metric,
  SearchHit,
  SearchResponse,
  StockSnapshot,
} from "@/lib/contract";
import { DataError } from "./errors";
import type { DataSourceApi } from "./source";

type Loader<T> = () => Promise<{ default: unknown }> & Promise<{ default: T }>;
const as = <T>(l: () => Promise<{ default: unknown }>) =>
  l as unknown as Loader<T>;

const stocks: Record<string, Loader<StockSnapshot>> = {
  AAPL: as(() => import("@/tests/fixtures/contract/AAPL/stock.json")),
  "MC.PA": as(() => import("@/tests/fixtures/contract/MC.PA/stock.json")),
  "7203.T": as(() => import("@/tests/fixtures/contract/7203.T/stock.json")),
  SPY: as(() => import("@/tests/fixtures/contract/SPY/stock.json")),
  TSM: as(() => import("@/tests/fixtures/contract/TSM/stock.json")),
};

const charts: Record<
  string,
  { w: Loader<ChartResponse>; y: Loader<ChartResponse> }
> = {
  AAPL: {
    w: as(() => import("@/tests/fixtures/contract/AAPL/chart-1W.json")),
    y: as(() => import("@/tests/fixtures/contract/AAPL/chart-1Y.json")),
  },
  "MC.PA": {
    w: as(() => import("@/tests/fixtures/contract/MC.PA/chart-1W.json")),
    y: as(() => import("@/tests/fixtures/contract/MC.PA/chart-1Y.json")),
  },
  "7203.T": {
    w: as(() => import("@/tests/fixtures/contract/7203.T/chart-1W.json")),
    y: as(() => import("@/tests/fixtures/contract/7203.T/chart-1Y.json")),
  },
  SPY: {
    w: as(() => import("@/tests/fixtures/contract/SPY/chart-1W.json")),
    y: as(() => import("@/tests/fixtures/contract/SPY/chart-1Y.json")),
  },
  TSM: {
    w: as(() => import("@/tests/fixtures/contract/TSM/chart-1W.json")),
    y: as(() => import("@/tests/fixtures/contract/TSM/chart-1Y.json")),
  },
};

const searches = [
  () => import("@/tests/fixtures/contract/_search/apple.json"),
  () => import("@/tests/fixtures/contract/_search/lvmh.json"),
] as unknown as Array<() => Promise<{ default: SearchResponse }>>;

/** A little latency so skeletons are visible while developing. */
function pause(signal?: AbortSignal, ms = 180): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted)
      return reject(new DOMException("Aborted", "AbortError"));
    const id = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(id);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

function loaderFor<T>(table: Record<string, T>, symbol: string): T {
  const found = table[symbol.toUpperCase()];
  if (!found) throw new DataError("not_found", `No fixture for ${symbol}`);
  return found;
}

function cut(
  series: ChartSeries,
  range: ChartRange,
  count: number | null,
  fallback: ChartSeries["fallback"],
): ChartSeries {
  const candles: Candle[] = count
    ? series.candles.slice(-count)
    : series.candles;
  return { ...series, range, candles, fallback };
}

export const fixtureSource: DataSourceApi = {
  async search(query, signal) {
    await pause(signal, 120);
    const q = query.trim().toLowerCase();
    const hits = new Map<string, SearchHit>();
    for (const load of searches)
      for (const h of (await load()).default.hits) hits.set(h.symbol, h);
    for (const [symbol, load] of Object.entries(stocks)) {
      const l = (await load()).default.listing;
      hits.set(symbol, {
        symbol,
        name: l.shortName ?? l.name,
        exchange: l.exchange,
        exchangeCode: l.exchangeCode,
        quoteType: l.quoteType,
        sector: null,
        industry: null,
      });
    }
    const matching = [...hits.values()].filter(
      (h) =>
        q.length > 0 &&
        (h.symbol.toLowerCase().includes(q) ||
          h.name.toLowerCase().includes(q)),
    );
    return { query, hits: matching };
  },

  async stock(symbol, signal) {
    await pause(signal);
    return (await loaderFor(stocks, symbol)()).default;
  },

  async chart(symbol, range, signal) {
    await pause(signal, 150);
    const sets = loaderFor(charts, symbol);
    const week = (await sets.w()).default;
    const year = (await sets.y()).default;
    const base = ["1H", "1D", "1W"].includes(range) ? week : year;
    const series = base.series.value;
    if (!series) return { ...base, range };
    const closed = series.marketState !== "REGULAR";
    const cuts: Record<ChartRange, [number | null, ChartSeries["fallback"]]> = {
      "1H": [4, closed ? "last_trading_hour" : null],
      "1D": [26, null],
      "1W": [null, null],
      "1M": [21, null],
      "1Y": [null, null],
      "3Y": [null, null],
      "5Y": [null, null],
      ALL: [null, null],
    };
    const [count, fallback] = cuts[range];
    const value = cut(series, range, count, fallback);
    const result: Metric<ChartSeries> = { value, reason: null };
    return { ...base, range, series: result };
  },
};
