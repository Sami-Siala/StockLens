import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiError, HealthReport, ThesisResponse } from "@/lib/contract";
import { setStoreForTests } from "@/lib/providers/cache";
import { MemoryStore } from "@/lib/providers/cache/memory";
import { ResilientStore } from "@/lib/providers/cache/resilient";
import { ProviderError } from "@/lib/providers/errors";
import { FakeYahooClient } from "../helpers/fake-yahoo";
import { makeService } from "../helpers/setup";
import { fakeGemini, GOOD_REPLY, loadStock, okBody } from "./helpers";

vi.mock("server-only", () => ({}));

const { GET } = await import("@/app/api/ai/[symbol]/route");
const { GET: healthGET } = await import("@/app/api/health/route");
const { AiService } = await import("@/lib/ai/service");
const { GeminiClient } = await import("@/lib/ai/gemini");
const { AI_CONFIG } = await import("@/lib/ai/config");

const g = globalThis as unknown as {
  __stocklensAi?: unknown;
  __stocklensService?: unknown;
};
const ORIGIN = "http://localhost:3000";
const req = (
  path: string,
  headers: Record<string, string> = { origin: ORIGIN },
) => new Request(`${ORIGIN}${path}`, { headers });
const sym = (s: string) => ({ params: Promise.resolve({ symbol: s }) });

let calls: ReturnType<typeof fakeGemini>["calls"];
function install(opts: { key?: boolean; notFound?: boolean } = {}) {
  const store = new MemoryStore();
  setStoreForTests(new ResilientStore(store));
  const fake = fakeGemini(() => okBody(GOOD_REPLY));
  calls = fake.calls;
  g.__stocklensAi = new AiService({
    store,
    getStock: async (s) => {
      if (opts.notFound) throw new ProviderError("not_found", "nope");
      return loadStock(s === "SPY" ? "SPY" : "AAPL");
    },
    gemini: opts.key === false ? null : new GeminiClient(fake.transport),
  });
  g.__stocklensService = makeService({ client: new FakeYahooClient() }).service;
}

beforeEach(() => install());
afterEach(() => {
  setStoreForTests(null);
  g.__stocklensAi = undefined;
  g.__stocklensService = undefined;
});

describe("GET /api/ai/[symbol]", () => {
  it("returns a ThesisResponse with noindex and no-store", async () => {
    const res = await GET(req("/api/ai/aapl?lang=fr"), sym("aapl"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toMatch(/noindex/);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    const body = (await res.json()) as ThesisResponse;
    expect(body.meta.contractVersion).toBe("0.4.0");
    expect(body.meta.language).toBe("fr");
    expect(body.result.status).toBe("ready");
  });

  it("defaults to English and validates lang and symbol", async () => {
    expect(
      (
        (await (
          await GET(req("/api/ai/AAPL"), sym("AAPL"))
        ).json()) as ThesisResponse
      ).meta.language,
    ).toBe("en");
    const bad = await GET(req("/api/ai/AAPL?lang=de"), sym("AAPL"));
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as ApiError).error.code).toBe("bad_request");
    expect((await GET(req("/api/ai/%20"), sym("%20"))).status).toBe(400);
  });

  it("answers an unavailable AI with 200, not an error", async () => {
    install({ key: false });
    const res = await GET(req("/api/ai/AAPL"), sym("AAPL"));
    expect(res.status).toBe(200);
    expect(((await res.json()) as ThesisResponse).result).toEqual({
      status: "unavailable",
      reason: "no_key",
    });
    const etf = (await (
      await GET(req("/api/ai/SPY"), sym("SPY"))
    ).json()) as ThesisResponse;
    expect(etf.result).toMatchObject({
      status: "unavailable",
      reason: "not_applicable_for_type",
    });
  });

  it("maps a market-data failure like the other routes", async () => {
    install({ notFound: true });
    expect((await GET(req("/api/ai/ZZZZ"), sym("ZZZZ"))).status).toBe(404);
  });

  it("refuses foreign origins and the club-code gate like the other routes", async () => {
    expect(
      (
        await GET(
          req("/api/ai/AAPL", { origin: "https://evil.example" }),
          sym("AAPL"),
        )
      ).status,
    ).toBe(403);
    process.env.CLUB_CODE = "secret";
    try {
      expect((await GET(req("/api/ai/AAPL"), sym("AAPL"))).status).toBe(401);
    } finally {
      delete process.env.CLUB_CODE;
    }
  });

  it("has its own, lower rate limit so it cannot burn the quota", async () => {
    const h = { origin: ORIGIN, "x-forwarded-for": "9.9.9.9" };
    let last = 0;
    for (let i = 0; i < AI_CONFIG.ratePerMinutePerIp + 1; i++)
      last = (await GET(req("/api/ai/AAPL", h), sym("AAPL"))).status;
    expect(last).toBe(429);
    // the general API bucket is a separate counter, still far from its ceiling
    const { guard } = await import("@/lib/providers/http");
    expect(await guard(req("/api/stock/AAPL", h))).toBeNull();
    // one generation only, however many requests
    expect(calls).toHaveLength(1);
  });
});

describe("GET /api/health with Gemini", () => {
  it("lists Gemini without letting it change the overall status", async () => {
    install({ key: false });
    const report = (await (
      await healthGET(req("/api/health"))
    ).json()) as HealthReport;
    const gem = report.providers.find((p) => p.name === "gemini");
    expect(gem).toMatchObject({ status: "down" });
    expect(report.status).toBe("ok");
    expect(report.providers.map((p) => p.name)).toEqual(
      expect.arrayContaining(["yahoo", "upstash", "gemini"]),
    );
  });
});
