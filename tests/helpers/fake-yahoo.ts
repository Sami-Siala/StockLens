import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ProviderError } from "@/lib/providers/errors";
import type { YahooClient } from "@/lib/providers/yahoo-client";

/**
 * Replays RECORDED Yahoo payloads (tests/fixtures/raw) through the YahooClient interface, so the
 * real normalisers, cache and service run end to end with no network. Counts every call.
 */
export const RAW_DIR = join(process.cwd(), "tests/fixtures/raw");

const cache = new Map<string, unknown>();
export async function readRaw<T = unknown>(
  symbol: string,
  name: string,
): Promise<T> {
  const key = `${symbol}/${name}`;
  if (!cache.has(key))
    cache.set(
      key,
      JSON.parse(await readFile(join(RAW_DIR, symbol, `${name}.json`), "utf8")),
    );
  return cache.get(key) as T;
}

const CHART_FILE: Record<string, string> = {
  "1m": "chart-1m-1m",
  "5m": "chart-5d-5m",
  "15m": "chart-5d-15m",
  "1h": "chart-1mo-1h",
  "1d": "chart-1y-1d",
  "1wk": "chart-3y-1wk",
  "1mo": "chart-all-1mo",
};

export interface FakeOptions {
  /** Artificial latency per call, so concurrent callers really overlap. */
  delayMs?: number;
  /** Make every call of this kind fail with this error. */
  fail?: Partial<Record<keyof FakeYahooClient["calls"], ProviderError>>;
}

export class FakeYahooClient implements YahooClient {
  calls = { quote: 0, quoteSummary: 0, timeSeries: 0, chart: 0, search: 0 };
  constructor(public opts: FakeOptions = {}) {}

  get totalCalls() {
    return Object.values(this.calls).reduce((a, b) => a + b, 0);
  }

  private async tick(kind: keyof FakeYahooClient["calls"]) {
    this.calls[kind]++;
    if (this.opts.delayMs)
      await new Promise((r) => setTimeout(r, this.opts.delayMs));
    const f = this.opts.fail?.[kind];
    if (f) throw f;
  }

  private async load<T>(symbol: string, name: string): Promise<T> {
    try {
      return await readRaw<T>(symbol, name);
    } catch {
      throw new ProviderError("not_found", `no fixture ${symbol}/${name}`);
    }
  }

  async quote(symbol: string) {
    await this.tick("quote");
    const q = await this.load<Record<string, unknown>>(symbol, "quote");
    return "error" in q ? undefined : q;
  }

  async quoteSummary(symbol: string, modules: readonly string[]) {
    await this.tick("quoteSummary");
    const all = await this.load<Record<string, unknown>>(
      symbol,
      "quoteSummary",
    );
    const out: Record<string, unknown> = {};
    for (const m of modules) {
      const v = all[m];
      // The recorder stored failed modules as {error}; live Yahoo simply omits them.
      if (v && typeof v === "object" && !("error" in v)) out[m] = v;
    }
    if (!Object.keys(out).length)
      throw new ProviderError("not_found", "No fundamentals data found");
    return out;
  }

  async fundamentalsTimeSeries(
    symbol: string,
    o: { type: "quarterly" | "annual" },
  ) {
    await this.tick("timeSeries");
    const rows = await this.load<unknown>(symbol, `fundamentals-${o.type}`);
    return Array.isArray(rows) ? rows : [];
  }

  async chart(symbol: string, o: { interval: string }) {
    await this.tick("chart");
    const file = CHART_FILE[o.interval];
    if (!file)
      throw new ProviderError("upstream", `bad interval ${o.interval}`);
    return this.load(symbol, file);
  }

  async search(query: string) {
    await this.tick("search");
    const name = query.toLowerCase().includes("lvmh") ? "lvmh" : "apple";
    return this.load("_search", name);
  }
}
