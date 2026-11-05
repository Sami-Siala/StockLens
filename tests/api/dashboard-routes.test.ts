import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiError,
  MarketResponse,
  QuotesResponse,
  TickerResponse,
} from "@/lib/contract";
import { setStoreForTests } from "@/lib/providers/cache";
import { ResilientStore } from "@/lib/providers/cache/resilient";
import { ProviderError } from "@/lib/providers/errors";
import { FakeYahooClient } from "../helpers/fake-yahoo";
import { makeService } from "../helpers/setup";

vi.mock("server-only", () => ({}));

const { GET: quotesGET } = await import("@/app/api/quotes/route");
const { GET: marketGET } = await import("@/app/api/market/route");
const { GET: tickerGET } = await import("@/app/api/ticker/route");

const g = globalThis as unknown as { __stocklensService?: unknown };
const ORIGIN = "http://localhost:3000";
const req = (
  path: string,
  headers: Record<string, string> = { origin: ORIGIN },
) => new Request(`${ORIGIN}${path}`, { headers });

let client: FakeYahooClient;
beforeEach(() => {
  const made = makeService({
    clock: { t: Date.parse("2026-11-05T21:30:00Z") },
  });
  client = made.client;
  setStoreForTests(new ResilientStore(made.store));
  g.__stocklensService = made.service;
});
afterEach(() => {
  delete process.env.CLUB_CODE;
  setStoreForTests(null);
  g.__stocklensService = undefined;
});

describe("GET /api/quotes", () => {
  it("returns a v0.3.0 QuotesResponse: normalised, de-duplicated, in order, no-store + noindex", async () => {
    const res = await quotesGET(
      req("/api/quotes?symbols=aapl,%20mc.pa,AAPL,spy"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toMatch(/noindex/);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    const body = (await res.json()) as QuotesResponse;
    expect(body.meta).toMatchObject({
      contractVersion: "0.3.1",
      source: "yahoo",
      stale: false,
    });
    expect(body.entries.map((e) => [e.symbol, e.status])).toEqual([
      ["AAPL", "ok"],
      ["MC.PA", "ok"],
      ["SPY", "ok"],
    ]);
    expect(client.calls.quotes).toBe(1);
  });

  it("reports an unknown and an invalid symbol inline, with HTTP 200", async () => {
    const res = await quotesGET(
      req("/api/quotes?symbols=AAPL,ZZZNOTREAL123,%3Cscript%3E"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as QuotesResponse;
    expect(body.entries.map((e) => e.status)).toEqual([
      "ok",
      "not_found",
      "invalid",
    ]);
    expect(client.batches).toEqual([["AAPL", "ZZZNOTREAL123"]]);
  });

  it.each([
    ["missing", "/api/quotes"],
    ["empty", "/api/quotes?symbols="],
    ["only commas", "/api/quotes?symbols=,,,"],
    [
      "26 symbols",
      `/api/quotes?symbols=${Array.from({ length: 26 }, (_, i) => `T${i}`).join(",")}`,
    ],
    ["too long", `/api/quotes?symbols=${"A".repeat(900)}`],
  ])("400 for %s, and Yahoo is never called", async (_n, path) => {
    const res = await quotesGET(req(path));
    expect(res.status).toBe(400);
    expect(((await res.json()) as ApiError).error.code).toBe("bad_request");
    expect(client.totalCalls).toBe(0);
  });

  it("200 with inline `unavailable` entries (not a 502) when Yahoo is down and nothing is cached", async () => {
    client.opts.fail = {
      quotes: new ProviderError("upstream", "429 crumb=SECRET"),
    };
    const res = await quotesGET(req("/api/quotes?symbols=AAPL,MC.PA"));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(/crumb|SECRET|429/);
    expect(
      (JSON.parse(text) as QuotesResponse).entries.map((e) => e.status),
    ).toEqual(["unavailable", "unavailable"]);
  });

  it("guards: Origin check (403) and club code (401)", async () => {
    expect((await quotesGET(req("/api/quotes?symbols=AAPL", {}))).status).toBe(
      403,
    );
    expect(
      (
        await quotesGET(
          req("/api/quotes?symbols=AAPL", { origin: "https://evil.example" }),
        )
      ).status,
    ).toBe(403);
    process.env.CLUB_CODE = "secret-club";
    expect((await quotesGET(req("/api/quotes?symbols=AAPL"))).status).toBe(401);
    const ok = await quotesGET(
      req("/api/quotes?symbols=AAPL", {
        origin: ORIGIN,
        cookie: "stocklens_club=secret-club",
      }),
    );
    expect(ok.status).toBe(200);
    expect(client.totalCalls).toBeGreaterThan(0);
  });
});

describe("GET /api/market", () => {
  it("returns the v0.3.0 strip + chips", async () => {
    const res = await marketGET(req("/api/market"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toMatch(/noindex/);
    const body = (await res.json()) as MarketResponse;
    expect(body.meta.contractVersion).toBe("0.3.1");
    expect(body.indices).toHaveLength(8);
    expect(body.status).toHaveLength(3);
    expect(client.calls.quotes).toBe(1);
  });

  it("guards: 403 without an Origin; 401 without the club cookie", async () => {
    expect((await marketGET(req("/api/market", {}))).status).toBe(403);
    process.env.CLUB_CODE = "x";
    expect((await marketGET(req("/api/market"))).status).toBe(401);
  });

  it("when Yahoo is down and nothing is cached: 200, every item provider_error, chips from the schedule", async () => {
    client.opts.fail = { quotes: new ProviderError("upstream", "429") };
    const body = (await (
      await marketGET(req("/api/market"))
    ).json()) as MarketResponse;
    expect(body.indices.every((i) => i.quote.reason === "provider_error")).toBe(
      true,
    );
    expect(body.status.every((s) => s.basis === "schedule")).toBe(true);
  });
});

describe("GET /api/ticker", () => {
  it("returns the v0.3.1 band: 25 items, one batched quote(), no chart call, noindex + no-store", async () => {
    const res = await tickerGET(req("/api/ticker"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toMatch(/noindex/);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    const body = (await res.json()) as TickerResponse;
    expect(body.meta.contractVersion).toBe("0.3.1");
    expect(body.items).toHaveLength(25);
    expect(body.items[0]).toMatchObject({
      id: "sp500",
      label: "S&P 500",
      region: "americas",
      kind: "index",
      symbol: "^GSPC",
      status: "ok",
    });
    expect(client.calls.quotes).toBe(1);
    expect(client.calls.chart).toBe(0);
  });

  it("guards: 403 without an Origin; 401 without the club cookie", async () => {
    expect((await tickerGET(req("/api/ticker", {}))).status).toBe(403);
    process.env.CLUB_CODE = "x";
    expect((await tickerGET(req("/api/ticker"))).status).toBe(401);
  });

  it("when Yahoo is down and nothing is cached: still 200, every item unavailable", async () => {
    client.opts.fail = { quotes: new ProviderError("upstream", "429") };
    const res = await tickerGET(req("/api/ticker"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as TickerResponse;
    expect(body.items).toHaveLength(25);
    expect(body.items.every((i) => i.status === "unavailable")).toBe(true);
  });
});
