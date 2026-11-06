import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiError,
  ChartResponse,
  HealthReport,
  SearchResponse,
  StockSnapshot,
} from "@/lib/contract";
import { setStoreForTests } from "@/lib/providers/cache";
import { ResilientStore } from "@/lib/providers/cache/resilient";
import { ProviderError } from "@/lib/providers/errors";
import { guard } from "@/lib/providers/http";
import { FakeYahooClient } from "../helpers/fake-yahoo";
import { makeService } from "../helpers/setup";

vi.mock("server-only", () => ({}));

const { GET: stockGET } = await import("@/app/api/stock/[symbol]/route");
const { GET: chartGET } = await import("@/app/api/chart/[symbol]/route");
const { GET: searchGET } = await import("@/app/api/search/route");
const { GET: healthGET } = await import("@/app/api/health/route");
const { POST: clubPOST } = await import("@/app/api/club/route");

const g = globalThis as unknown as { __stocklensService?: unknown };
const ORIGIN = "http://localhost:3000";
const req = (
  path: string,
  headers: Record<string, string> = { origin: ORIGIN },
) => new Request(`${ORIGIN}${path}`, { headers });
const sym = (s: string) => ({ params: Promise.resolve({ symbol: s }) });

let client: FakeYahooClient;
beforeEach(() => {
  const made = makeService();
  client = made.client;
  setStoreForTests(new ResilientStore(made.store));
  g.__stocklensService = made.service;
});
afterEach(() => {
  delete process.env.CLUB_CODE;
  delete process.env.ALLOWED_ORIGINS;
  setStoreForTests(null);
  g.__stocklensService = undefined;
});

describe("GET /api/stock/[symbol]", () => {
  it("returns a contract StockSnapshot with noindex and no-store headers", async () => {
    const res = await stockGET(req("/api/stock/aapl"), sym("aapl"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toMatch(/noindex/);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    const body = (await res.json()) as StockSnapshot;
    expect(body.meta).toMatchObject({
      contractVersion: "0.3.1",
      source: "yahoo",
      stale: false,
    });
    expect(body.listing.symbol).toBe("AAPL");
    expect(body.quote.value!.price.currency).toBe("USD");
  });

  it("an ETF returns 200 with not_applicable_for_type sections", async () => {
    const body = (await (
      await stockGET(req("/api/stock/SPY"), sym("SPY"))
    ).json()) as StockSnapshot;
    expect(body.fundamentals.reason).toBe("not_applicable_for_type");
  });

  it.each(["A;B", "<script>", "X".repeat(30), "a b"])(
    "400 for invalid ticker %j",
    async (s) => {
      const res = await stockGET(req("/api/stock/x"), sym(s));
      expect(res.status).toBe(400);
      expect(((await res.json()) as ApiError).error.code).toBe("bad_request");
      expect(client.totalCalls).toBe(0);
    },
  );

  it("404 for an unknown ticker", async () => {
    const res = await stockGET(req("/api/stock/NOPE"), sym("NOPE"));
    expect(res.status).toBe(404);
    expect(((await res.json()) as ApiError).error.code).toBe("not_found");
  });

  it("502 upstream_unavailable when Yahoo is down and there is no stale copy; no internals leak", async () => {
    client.opts.fail = {
      quote: new ProviderError("upstream", "429 https://x?crumb=SECRETCRUMB"),
    };
    const res = await stockGET(req("/api/stock/AAPL"), sym("AAPL"));
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).toContain("upstream_unavailable");
    expect(text).not.toMatch(/crumb|SECRET|429/);
  });
});

describe("GET /api/chart/[symbol]", () => {
  it("defaults to 1D and serves every range", async () => {
    const d = (await (
      await chartGET(req("/api/chart/AAPL"), sym("AAPL"))
    ).json()) as ChartResponse;
    expect(d.range).toBe("1D");
    for (const r of ["1H", "1W", "1M", "1Y", "3Y", "5Y", "all"]) {
      const res = await chartGET(
        req(`/api/chart/AAPL?range=${r}`),
        sym("AAPL"),
      );
      expect(res.status, r).toBe(200);
      const body = (await res.json()) as ChartResponse;
      expect(body.series.value!.candles.length).toBeGreaterThan(5);
    }
  });
  it("400 for an unknown range", async () => {
    const res = await chartGET(req("/api/chart/AAPL?range=2Y"), sym("AAPL"));
    expect(res.status).toBe(400);
  });
  it("1H on a closed market reports the fallback", async () => {
    const body = (await (
      await chartGET(req("/api/chart/7203.T?range=1H"), sym("7203.T"))
    ).json()) as ChartResponse;
    expect(body.series.value).toMatchObject({
      marketClosed: true,
      fallback: "last_trading_hour",
    });
  });
});

describe("GET /api/search", () => {
  it("finds LVMH on Paris", async () => {
    const body = (await (
      await searchGET(req("/api/search?q=lvmh"))
    ).json()) as SearchResponse;
    expect(body.query).toBe("lvmh");
    expect(body.hits[0]).toMatchObject({
      symbol: "MC.PA",
      exchangeCode: "PAR",
      quoteType: "EQUITY",
    });
  });
  it("400 for a missing or blank query", async () => {
    expect((await searchGET(req("/api/search"))).status).toBe(400);
    expect((await searchGET(req("/api/search?q=%20%20"))).status).toBe(400);
  });
});

describe("GET /api/health", () => {
  it("is readable without an Origin header and exposes no secrets", async () => {
    await stockGET(req("/api/stock/AAPL"), sym("AAPL"));
    const res = await healthGET(req("/api/health", {}));
    expect(res.status).toBe(200);
    const h = (await res.json()) as HealthReport;
    expect(h.status).toBe("ok");
    expect(h.providers.map((p) => p.name)).toEqual([
      "yahoo",
      "upstash",
      "gemini",
    ]);
    expect(JSON.stringify(h)).not.toMatch(
      /UPSTASH_|GEMINI_|token|api[_-]?key/i,
    );
  });
});

describe("Origin / Referer check", () => {
  it("rejects requests with no Origin/Referer (curl, scripts)", async () => {
    const res = await stockGET(req("/api/stock/AAPL", {}), sym("AAPL"));
    expect(res.status).toBe(403);
    expect(((await res.json()) as ApiError).error.code).toBe("forbidden");
  });
  it("rejects a foreign Origin", async () => {
    const res = await stockGET(
      req("/api/stock/AAPL", { origin: "https://evil.example" }),
      sym("AAPL"),
    );
    expect(res.status).toBe(403);
  });
  it("accepts same-origin Sec-Fetch-Site, a matching Referer, and ALLOWED_ORIGINS", async () => {
    expect(
      (
        await stockGET(
          req("/api/stock/AAPL", { "sec-fetch-site": "same-origin" }),
          sym("AAPL"),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await stockGET(
          req("/api/stock/AAPL", { referer: `${ORIGIN}/fr/stock/AAPL` }),
          sym("AAPL"),
        )
      ).status,
    ).toBe(200);
    process.env.ALLOWED_ORIGINS = "https://stocklens-beryl.vercel.app";
    expect(
      (
        await stockGET(
          req("/api/stock/AAPL", {
            origin: "https://stocklens-beryl.vercel.app",
          }),
          sym("AAPL"),
        )
      ).status,
    ).toBe(200);
  });
  it("a cross-site browser request is rejected", async () => {
    const res = await stockGET(
      req("/api/stock/AAPL", { "sec-fetch-site": "cross-site" }),
      sym("AAPL"),
    );
    expect(res.status).toBe(403);
  });
});

describe("per-IP rate limit", () => {
  it("returns 429 + Retry-After past the ceiling; other IPs are unaffected", async () => {
    const mk = (ip: string) =>
      req("/api/stock/AAPL", {
        origin: ORIGIN,
        "x-forwarded-for": `${ip}, 10.0.0.1`,
      });
    for (let i = 0; i < 3; i++)
      expect(await guard(mk("9.9.9.9"), { limit: 3 })).toBeNull();
    const blocked = await guard(mk("9.9.9.9"), { limit: 3 });
    expect(blocked!.status).toBe(429);
    expect(Number(blocked!.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(((await blocked!.json()) as ApiError).error.code).toBe(
      "rate_limited",
    );
    expect(await guard(mk("8.8.8.8"), { limit: 3 })).toBeNull();
  });
  it("the default ceiling does not trip for a class of 15 sharing one IP", async () => {
    for (let i = 0; i < 150; i++)
      expect(await guard(req("/api/stock/AAPL"))).toBeNull();
  });
});

describe("optional club code", () => {
  it("gate off (CLUB_CODE empty): no cookie needed, /api/club is a no-op", async () => {
    expect((await stockGET(req("/api/stock/AAPL"), sym("AAPL"))).status).toBe(
      200,
    );
    const res = await clubPOST(
      new Request(`${ORIGIN}/api/club`, {
        method: "POST",
        headers: { origin: ORIGIN },
        body: "{}",
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
  it("gate on: 401 without the cookie, 200 with it; wrong code rejected, right code sets an HttpOnly cookie", async () => {
    process.env.CLUB_CODE = "s3cret-club";
    expect(
      (
        (await (
          await stockGET(req("/api/stock/AAPL"), sym("AAPL"))
        ).json()) as ApiError
      ).error.code,
    ).toBe("unauthorized");

    const post = (code: string) =>
      clubPOST(
        new Request(`${ORIGIN}/api/club`, {
          method: "POST",
          headers: { origin: ORIGIN, "content-type": "application/json" },
          body: JSON.stringify({ code }),
        }),
      );
    expect((await post("wrong")).status).toBe(401);
    const ok = await post("s3cret-club");
    expect(ok.status).toBe(204);
    const cookie = ok.headers.get("set-cookie")!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);

    const withCookie = req("/api/stock/AAPL", {
      origin: ORIGIN,
      cookie: cookie.split(";")[0],
    });
    expect((await stockGET(withCookie, sym("AAPL"))).status).toBe(200);
    const wrongCookie = req("/api/stock/AAPL", {
      origin: ORIGIN,
      cookie: "stocklens_club=nope",
    });
    expect((await stockGET(wrongCookie, sym("AAPL"))).status).toBe(401);
  });
});
