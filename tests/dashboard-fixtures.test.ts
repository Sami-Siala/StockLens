import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type {
  MarketResponse,
  Metric,
  QuoteEntry,
  QuotesResponse,
  TickerResponse,
} from "@/lib/contract";

vi.mock("server-only", () => ({}));

const DIR = join(__dirname, "fixtures/contract/_dashboard");
const load = <T>(file: string): T =>
  JSON.parse(readFileSync(join(DIR, file), "utf8")) as T;

function eachMetric(
  node: unknown,
  fn: (m: Metric<unknown>, path: string) => void,
  path = "",
): void {
  if (Array.isArray(node))
    return node.forEach((v, i) => eachMetric(v, fn, `${path}[${i}]`));
  if (!node || typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  if ("value" in o && "reason" in o && Object.keys(o).length === 2)
    fn(o as Metric<unknown>, path);
  for (const [k, v] of Object.entries(o))
    eachMetric(v, fn, path ? `${path}.${k}` : k);
}

function clean(name: string, body: unknown) {
  it(`${name}: Metric value XOR reason, no NaN, no undefined text`, () => {
    let n = 0;
    eachMetric(body, (m, path) => {
      n++;
      expect(m.value === null, path).toBe(m.reason !== null);
      if (typeof m.value === "number")
        expect(Number.isFinite(m.value)).toBe(true);
    });
    expect(n).toBeGreaterThan(5);
    expect(JSON.stringify(body)).not.toMatch(/NaN|undefined/);
  });
}

describe("dashboard contract fixtures (v0.3.0)", () => {
  const quotes = load<QuotesResponse>("quotes.json");
  const market = load<MarketResponse>("market.json");
  const open = load<MarketResponse>("market-open.json");
  const degraded = load<MarketResponse>("market-degraded.json");

  clean("quotes.json", quotes);
  clean("market.json", market);
  clean("market-open.json", open);
  clean("market-degraded.json", degraded);

  it("quotes.json covers every entry status, including a stale and a failed symbol", () => {
    expect(quotes.meta.contractVersion).toBe("0.3.0");
    const by = (s: QuoteEntry["status"]) =>
      quotes.entries.filter((e) => e.status === s);
    expect(by("ok").length).toBeGreaterThanOrEqual(6);
    for (const s of ["unavailable", "not_found", "invalid"] as const) {
      expect(by(s), s).toHaveLength(1);
      expect(by(s)[0].quote.value).toBeNull();
    }
    expect(quotes.entries.filter((e) => e.stale)).toHaveLength(1);
    expect(quotes.meta.stale).toBe(true);
  });

  it("quotes.json keeps the unit rules: fractions, major currency, <= 30 sparkline points", () => {
    for (const e of quotes.entries) {
      const q = e.quote.value;
      if (!q) continue;
      expect(q.priceCurrency, e.symbol).toMatch(/^[A-Z]{3}$/); // never GBp
      expect(Math.abs(q.changePercent ?? 0), e.symbol).toBeLessThan(1); // fraction, not percent
      const sp = q.sparkline.value;
      if (sp) {
        expect(sp.length).toBeGreaterThanOrEqual(2);
        expect(sp.length).toBeLessThanOrEqual(30);
      }
    }
    const shell = quotes.entries.find((e) => e.symbol === "SHEL.L")!.quote
      .value!;
    expect(shell.priceSubunit).toEqual({ quotedAs: "GBp", factor: 100 });
    expect(shell.price).toBeLessThan(100);
  });

  it("market.json: 8 index items in strip order, 3 chips, everything closed", () => {
    expect(market.indices.map((i) => i.symbol)).toEqual([
      "^GSPC",
      "^IXIC",
      "^FCHI",
      "^STOXX50E",
      "^N225",
      "EURUSD=X",
      "GC=F",
      "^TNX",
    ]);
    expect(market.status.map((s) => s.id)).toEqual(["us", "paris", "tokyo"]);
    expect(market.status.every((s) => !s.isOpen)).toBe(true);
    // points / rates / yields never carry a currency; only the gold future does
    for (const i of market.indices)
      expect(i.quote.value!.priceCurrency).toBe(
        i.kind === "future" ? "USD" : null,
      );
  });

  it("market-open.json has the US session open; market-degraded.json has a failed and a stale item", () => {
    expect(open.status[0]).toMatchObject({
      id: "us",
      isOpen: true,
      marketState: "REGULAR",
    });
    expect(
      degraded.indices.find((i) => i.symbol === "^STOXX50E")!.quote,
    ).toEqual({
      value: null,
      reason: "provider_error",
    });
    expect(degraded.indices.find((i) => i.symbol === "^TNX")!.stale).toBe(true);
    expect(degraded.meta.stale).toBe(true);
  });
});

describe("ticker contract fixture (v0.3.1)", () => {
  const ticker = load<TickerResponse>("ticker.json");

  it("has 25 items in config order, one unavailable and one stale", async () => {
    const { TICKER_SYMBOLS } = await import("@/lib/providers/ticker-config");
    expect(ticker.meta.contractVersion).toBe("0.3.1");
    expect(ticker.meta.stale).toBe(true);
    expect(ticker.items.map((i) => i.symbol)).toEqual(TICKER_SYMBOLS);
    expect(ticker.items.filter((i) => i.status === "unavailable")).toHaveLength(
      1,
    );
    expect(ticker.items.filter((i) => i.stale)).toHaveLength(1);
  });

  it("follows the unit rules: fractions, no NaN, no currency on points, null numbers when unavailable", () => {
    expect(JSON.stringify(ticker)).not.toMatch(/NaN|undefined/);
    for (const i of ticker.items) {
      if (i.status === "unavailable") {
        expect([i.price, i.change, i.changePercent, i.asOf]).toEqual([
          null,
          null,
          null,
          null,
        ]);
        expect(i.marketState).toBe("UNKNOWN");
        continue;
      }
      expect(Number.isFinite(i.price!), i.id).toBe(true);
      expect(Math.abs(i.changePercent ?? 0), i.id).toBeLessThan(1);
      expect(i.priceCurrency, i.id).toBe(i.kind === "future" ? "USD" : null);
    }
    expect(ticker.items.filter((i) => i.kind === "yield")).toHaveLength(1);
    expect(ticker.items.filter((i) => i.kind === "volatility")).toHaveLength(1);
  });
});
