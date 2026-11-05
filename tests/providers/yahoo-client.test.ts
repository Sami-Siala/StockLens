import { describe, expect, it, vi } from "vitest";
import { MemoryStore } from "@/lib/providers/cache/memory";
import { ProviderError } from "@/lib/providers/errors";
import { createYahooClient, USER_AGENT } from "@/lib/providers/yahoo-client";

vi.mock("server-only", () => ({}));

/** A tiny fake of Yahoo's cookie + crumb + quote endpoints. */
function fakeYahoo() {
  const log = {
    cookieFlow: 0,
    crumb: 0,
    quote: 0,
    userAgents: new Set<string>(),
  };
  const quoteBody = JSON.stringify({
    quoteResponse: {
      result: [{ symbol: "AAPL", currency: "USD", regularMarketPrice: 1 }],
    },
  });
  const impl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const ua = new Headers(init?.headers).get("user-agent");
    if (ua) log.userAgents.add(ua);
    if (url.startsWith("https://finance.yahoo.com/quote/")) {
      log.cookieFlow++;
      return new Response("<html/>", {
        status: 200,
        headers: {
          "set-cookie":
            "A3=abc123; Domain=.yahoo.com; Path=/; Max-Age=31536000; Secure",
        },
      });
    }
    if (url.includes("/v1/test/getcrumb")) {
      log.crumb++;
      return new Response("CRUMB123", { status: 200 });
    }
    if (url.includes("/v7/finance/quote")) {
      log.quote++;
      if (!url.includes("crumb=CRUMB123"))
        return new Response("{}", { status: 401 });
      return new Response(quoteBody, { status: 200 });
    }
    if (url.includes("/v1/finance/search"))
      return new Response("Too Many Requests", { status: 429 });
    return new Response("{}", { status: 404 });
  };
  return { log, fetch: vi.fn(impl) as unknown as typeof fetch };
}

describe("Yahoo cookie + crumb persistence (cold starts must not re-fetch them)", () => {
  it("first instance fetches the crumb once and persists the jar; a 'cold-started' second instance reuses it", async () => {
    const store = new MemoryStore();
    const yahoo = fakeYahoo();

    const a = createYahooClient(store, { fetch: yahoo.fetch });
    await a.quote("AAPL");
    await a.quote("AAPL");
    expect(yahoo.log.cookieFlow).toBe(1);
    expect(yahoo.log.crumb).toBe(1);
    expect(await store.get("yahoo:cookiejar")).toMatchObject({
      cookies: expect.any(Array),
    });

    // New process (fresh in-memory jar), same shared store.
    const b = createYahooClient(store, { fetch: yahoo.fetch });
    const q = (await b.quote("AAPL")) as { symbol: string };
    expect(q.symbol).toBe("AAPL");
    expect(yahoo.log.cookieFlow).toBe(1); // NOT 2
    expect(yahoo.log.crumb).toBe(1); // NOT 2
    expect(yahoo.log.quote).toBe(3);
  });

  it("without a shared jar every cold start would redo the crumb dance (the control)", async () => {
    const yahoo = fakeYahoo();
    await createYahooClient(new MemoryStore(), { fetch: yahoo.fetch }).quote(
      "AAPL",
    );
    await createYahooClient(new MemoryStore(), { fetch: yahoo.fetch }).quote(
      "AAPL",
    );
    expect(yahoo.log.crumb).toBe(2);
  });

  it("sends our explicit User-Agent, not Node's default", async () => {
    const yahoo = fakeYahoo();
    await createYahooClient(new MemoryStore(), { fetch: yahoo.fetch }).quote(
      "AAPL",
    );
    expect([...yahoo.log.userAgents]).toEqual([USER_AGENT]);
    expect(USER_AGENT).toMatch(/StockLens/);
  });

  it("a corrupt persisted blob is ignored, not fatal", async () => {
    const store = new MemoryStore();
    await store.set("yahoo:cookiejar", { cookies: "garbage" }, 60);
    const yahoo = fakeYahoo();
    await expect(
      createYahooClient(store, { fetch: yahoo.fetch }).quote("AAPL"),
    ).resolves.toBeTruthy();
  });

  it("HTTP 429 maps to a typed upstream error that never leaks the URL/crumb", async () => {
    const yahoo = fakeYahoo();
    const err = (await createYahooClient(new MemoryStore(), {
      fetch: yahoo.fetch,
    })
      .search("apple")
      .catch((e: unknown) => e)) as ProviderError;
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe("upstream");
    expect(err.message).not.toMatch(/crumb=CRUMB123/);
  });

  it("times out instead of hanging a serverless function", async () => {
    const hang = vi.fn(
      () => new Promise<Response>(() => {}),
    ) as unknown as typeof fetch;
    const err = (await createYahooClient(new MemoryStore(), {
      fetch: hang,
      timeoutMs: 50,
    })
      .quote("AAPL")
      .catch((e: unknown) => e)) as ProviderError;
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.message).toMatch(/timed out/);
  });
});
