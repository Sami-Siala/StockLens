/**
 * LIVE smoke test against the real network. Opt-in: never part of `npm test`.
 * The orchestrator wires it into a weekly GitHub Action so we learn Yahoo broke BEFORE class.
 *
 *   npx tsx scripts/smoke.ts                       # in-process: real Yahoo through our provider + service
 *   npx tsx scripts/smoke.ts --base http://localhost:3000   # over HTTP against a running app (next start / Vercel)
 *   npx tsx scripts/smoke.ts AAPL MC.PA            # chosen symbols
 *   options: --delay 800 (ms between calls, default 700) --quiet
 *
 * Prints which fields came back for each ticker. Exit code 1 when a hard expectation fails
 * (core ticker without a quote, a chart range with no candles, HTTP errors, wrong shapes).
 * Missing *optional* fields are reported but are not failures: that is the point of the contract.
 */
import "./shim-server-only";
import type { ChartRange, ChartResponse, StockSnapshot } from "../lib/contract";
import { MemoryStore } from "../lib/providers/cache/memory";
import { DataService } from "../lib/providers/service";
import { YahooProvider } from "../lib/providers/yahoo";
import { createYahooClient } from "../lib/providers/yahoo-client";
import { extractFields } from "./availability";

const DEFAULT_SYMBOLS = [
  "AAPL", // US
  "MC.PA", // Paris, semi-annual reporter
  "7203.T", // Tokyo
  "TSM", // ADR: USD price, TWD statements
  "JPM", // bank
  "SPY", // ETF
  "RIVN", // loss-maker
  "SHEL.L", // London, pence
];
/** These must always have a quote and every chart range. */
const CORE = new Set(["AAPL", "MC.PA", "7203.T"]);
const RANGES: ChartRange[] = ["1H", "1D", "1W", "1M", "1Y", "3Y", "5Y", "ALL"];

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const base = opt("base")?.replace(/\/$/, "");
const delay = Number(opt("delay") ?? 700);
const quiet = flag("quiet");
const valueArgs = new Set([opt("base"), opt("delay")]);
const symbols = args.filter((a) => !a.startsWith("--") && !valueArgs.has(a));
const SYMBOLS = symbols.length ? symbols : DEFAULT_SYMBOLS;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const failures: string[] = [];
const fail = (msg: string) => {
  failures.push(msg);
  console.log(`  FAIL  ${msg}`);
};

interface Api {
  stock(s: string): Promise<StockSnapshot>;
  chart(s: string, r: ChartRange): Promise<ChartResponse>;
  search(q: string): Promise<{ hits: Array<{ symbol: string }> }>;
  health(): Promise<{ status: string; providers: unknown[] }>;
}

function httpApi(root: string): Api {
  const headers: Record<string, string> = { Origin: root };
  if (process.env.CLUB_CODE)
    headers.Cookie = `stocklens_club=${encodeURIComponent(process.env.CLUB_CODE)}`;
  const get = async <T>(path: string): Promise<T> => {
    const res = await fetch(root + path, { headers });
    if (!res.ok)
      throw new Error(
        `${path} -> HTTP ${res.status} ${(await res.text()).slice(0, 120)}`,
      );
    if (!/noindex/.test(res.headers.get("x-robots-tag") ?? ""))
      fail(`${path}: missing X-Robots-Tag noindex`);
    return (await res.json()) as T;
  };
  return {
    stock: (s) => get(`/api/stock/${encodeURIComponent(s)}`),
    chart: (s, r) => get(`/api/chart/${encodeURIComponent(s)}?range=${r}`),
    search: (q) => get(`/api/search?q=${encodeURIComponent(q)}`),
    health: () => get("/api/health"),
  };
}

function inProcessApi(): Api {
  const store = new MemoryStore();
  const service = new DataService({
    provider: new YahooProvider(createYahooClient(store)),
    store,
  });
  return {
    stock: (s) => service.getStock(s),
    chart: (s, r) => service.getChart(s, r),
    search: (q) => service.search(q),
    health: () => service.health(),
  };
}

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t0 = Date.now();
  const v = await fn();
  return [v, Date.now() - t0];
}

async function main() {
  const api = base ? httpApi(base) : inProcessApi();
  console.log(
    `StockLens live smoke: ${base ? `HTTP ${base}` : "in-process (real Yahoo, in-memory cache)"} | ${SYMBOLS.join(" ")}\n`,
  );

  try {
    const [h] = await timed(() => api.health());
    console.log(`health: ${h.status}`);
  } catch (e) {
    fail(`health: ${(e as Error).message}`);
  }

  try {
    const [s, ms] = await timed(() => api.search("lvmh"));
    console.log(
      `search "lvmh": ${s.hits.length} hits, first=${s.hits[0]?.symbol} (${ms} ms)`,
    );
    if (!s.hits.some((h) => h.symbol === "MC.PA"))
      fail("search lvmh did not return MC.PA");
  } catch (e) {
    fail(`search: ${(e as Error).message}`);
  }
  await sleep(delay);

  const summary: string[] = [];
  for (const symbol of SYMBOLS) {
    console.log(`\n== ${symbol}`);
    let stock: StockSnapshot;
    try {
      const [s, ms] = await timed(() => api.stock(symbol));
      stock = s;
      const q = s.quote.value;
      console.log(
        `  stock ${ms} ms | ${s.listing.name} | ${s.listing.quoteType} | ${q ? `${q.price.amount} ${q.price.currency} (${q.marketState}, delay ${q.delayMinutes} min)` : "NO QUOTE"} | stale=${s.meta.stale}`,
      );
      if (s.meta.contractVersion !== "0.2.0")
        fail(`${symbol}: unexpected contract ${s.meta.contractVersion}`);
      if (CORE.has(symbol) && !q) fail(`${symbol}: core ticker has no quote`);
      if (s.meta.degradedSections?.length)
        console.log(
          `  degraded sections: ${s.meta.degradedSections.join(", ")}`,
        );
      if (CORE.has(symbol) && s.meta.degradedSections?.length)
        fail(`${symbol}: degraded sections on a core ticker`);
    } catch (e) {
      fail(`${symbol}: stock: ${(e as Error).message}`);
      await sleep(delay);
      continue;
    }

    const charts: Record<string, ChartResponse | null> = {};
    for (const r of RANGES) {
      try {
        charts[r] = await api.chart(symbol, r);
      } catch (e) {
        charts[r] = null;
        fail(`${symbol}: chart ${r}: ${(e as Error).message}`);
      }
      await sleep(delay);
    }
    const counts = RANGES.map(
      (r) => `${r}:${charts[r]?.series.value?.candles.length ?? "ERR"}`,
    );
    console.log(`  charts  ${counts.join("  ")}`);
    const h1 = charts["1H"]?.series.value;
    if (h1)
      console.log(
        `  1H      marketClosed=${h1.marketClosed} fallback=${h1.fallback}`,
      );
    for (const r of RANGES) {
      const c = charts[r]?.series.value;
      if (!c) continue;
      for (let i = 1; i < c.candles.length; i++)
        if (!(c.candles[i].t > c.candles[i - 1].t)) {
          fail(`${symbol}: chart ${r}: timestamps not strictly ascending`);
          break;
        }
      if (c.candles.length === 0 && CORE.has(symbol))
        fail(`${symbol}: chart ${r} is empty`);
    }

    const groups = extractFields(stock, charts);
    const all = groups.flatMap((g) => g.fields);
    const missing = groups.flatMap((g) =>
      g.fields.filter(([, c]) => !c.ok).map(([n, c]) => `${n} [${c.code}]`),
    );
    console.log(
      `  fields  ${all.length - missing.length}/${all.length} present`,
    );
    if (!quiet && missing.length)
      console.log(`  missing ${missing.join("; ")}`);
    summary.push(
      `${symbol.padEnd(7)} ${all.length - missing.length}/${all.length}`,
    );
    await sleep(delay);
  }

  console.log("\nsummary (fields present):", summary.join(" | "));
  if (failures.length) {
    console.log(
      `\n${failures.length} FAILURE(S):\n - ${failures.join("\n - ")}`,
    );
    process.exit(1);
  }
  console.log("\nsmoke OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
