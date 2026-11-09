import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ChartResponse,
  HealthReport,
  SearchResponse,
  StockSnapshot,
} from "@/lib/contract";
import { setStoreForTests } from "@/lib/providers/cache";
import { ResilientStore } from "@/lib/providers/cache/resilient";
import { ProviderError } from "@/lib/providers/errors";
import { FakeYahooClient } from "../helpers/fake-yahoo";
import { makeService } from "../helpers/setup";

vi.mock("server-only", () => ({}));

const { GET: stockGET } = await import("@/app/api/stock/[symbol]/route");
const { GET: chartGET } = await import("@/app/api/chart/[symbol]/route");
const { GET: searchGET } = await import("@/app/api/search/route");
const { GET: healthGET } = await import("@/app/api/health/route");

/*
 * Step 6b: "Yahoo dies in the middle of class". Every route that reads Yahoo must keep answering
 * 200 from the stale copy (flagged `stale: true`) once the soft TTL has passed, and answer a clean
 * 502 with no internals when nothing is cached. The service-level behaviour is covered in
 * tests/providers/coldstart.test.ts; this file proves it at the HTTP layer for each route.
 */

const g = globalThis as unknown as { __stocklensService?: unknown };
const ORIGIN = "http://localhost:3000";
const req = (
  path: string,
  headers: Record<string, string> = { origin: ORIGIN },
) => new Request(`${ORIGIN}${path}`, { headers });
const sym = (s: string) => ({ params: Promise.resolve({ symbol: s }) });
const DOWN = () => new ProviderError("upstream", "429 Too Many Requests");
/** Past every soft TTL (the longest is 12 h for the "All" chart), inside every stale TTL (3 days+). */
const A_DAY = 24 * 3600_000;

let client: FakeYahooClient;
let clock: { t: number };
beforeEach(() => {
  const made = makeService();
  client = made.client;
  clock = made.clock;
  setStoreForTests(new ResilientStore(made.store));
  g.__stocklensService = made.service;
});
afterEach(() => {
  setStoreForTests(null);
  g.__stocklensService = undefined;
});

describe("Yahoo dies after a good load: HTTP routes serve the stale copy", () => {
  it("/api/stock keeps answering 200 with meta.stale=true and the same price", async () => {
    const fresh = (await (
      await stockGET(req("/api/stock/AAPL"), sym("AAPL"))
    ).json()) as StockSnapshot;
    expect(fresh.meta.stale).toBe(false);

    clock.t += A_DAY;
    client.opts.fail = {
      quote: DOWN(),
      quoteSummary: DOWN(),
      timeSeries: DOWN(),
    };
    const res = await stockGET(req("/api/stock/AAPL"), sym("AAPL"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as StockSnapshot;
    expect(body.meta.stale).toBe(true);
    expect(body.quote.value!.price.amount).toBe(
      fresh.quote.value!.price.amount,
    );
  });

  it.each(["1H", "1D", "1W", "1M", "1Y", "3Y", "5Y", "ALL"])(
    "/api/chart range %s keeps its candles with meta.stale=true",
    async (range) => {
      const path = `/api/chart/AAPL?range=${range}`;
      const fresh = (await (
        await chartGET(req(path), sym("AAPL"))
      ).json()) as ChartResponse;
      expect(fresh.meta.stale).toBe(false);
      expect(fresh.series.value!.candles.length).toBeGreaterThan(0);

      clock.t += A_DAY;
      client.opts.fail = { chart: DOWN() };
      const res = await chartGET(req(path), sym("AAPL"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as ChartResponse;
      expect(body.meta.stale).toBe(true);
      expect(body.series.value!.candles).toEqual(fresh.series.value!.candles);
    },
  );

  it("/api/search keeps its hits with meta.stale=true", async () => {
    const fresh = (await (
      await searchGET(req("/api/search?q=apple"))
    ).json()) as SearchResponse;
    expect(fresh.hits.length).toBeGreaterThan(0);

    clock.t += A_DAY;
    client.opts.fail = { search: DOWN() };
    const res = await searchGET(req("/api/search?q=apple"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponse;
    expect(body.meta?.stale).toBe(true);
    expect(body.hits).toEqual(fresh.hits);
  });

  it("/api/health reports Yahoo as down after repeated failures, with no secret in the body", async () => {
    await stockGET(req("/api/stock/AAPL"), sym("AAPL"));
    clock.t += A_DAY;
    // A real outage fails every module, otherwise a success resets the failure counter.
    const down = () => new ProviderError("upstream", "429 crumb=SECRETCRUMB");
    client.opts.fail = {
      quote: down(),
      quoteSummary: down(),
      timeSeries: down(),
    };
    // Health goes degraded after 1 to 2 consecutive failed upstream attempts, down after 3.
    // The 10 s failure cooldown would swallow a retry, so step the clock past it between loads.
    for (let i = 0; i < 4; i++) {
      await stockGET(req("/api/stock/AAPL"), sym("AAPL"));
      clock.t += 11_000;
    }

    const res = await healthGET(req("/api/health", {}));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(/SECRETCRUMB/);
    const report = JSON.parse(text) as HealthReport;
    expect(report.status).toBe("down");
    expect(report.providers[0].lastSuccessAt).not.toBeNull();
  });
});

describe("Yahoo is down and nothing is cached: a clean 502, no internals", () => {
  beforeEach(() => {
    client.opts.fail = {
      quote: DOWN(),
      quotes: DOWN(),
      quoteSummary: DOWN(),
      timeSeries: DOWN(),
      chart: DOWN(),
      search: DOWN(),
    };
  });

  it.each([
    ["stock", () => stockGET(req("/api/stock/AAPL"), sym("AAPL"))],
    ["chart", () => chartGET(req("/api/chart/AAPL?range=1D"), sym("AAPL"))],
    ["search", () => searchGET(req("/api/search?q=apple"))],
  ])("/api/%s", async (_name, call) => {
    const res = await call();
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).toContain("upstream_unavailable");
    expect(text).not.toMatch(/429|crumb|stack/i);
  });
});
