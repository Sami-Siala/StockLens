import { describe, expect, it, vi } from "vitest";
import { MemoryStore } from "@/lib/providers/cache/memory";
import { ProviderError } from "@/lib/providers/errors";
import { FakeYahooClient } from "../helpers/fake-yahoo";
import { makeService, RECORDED_AT } from "../helpers/setup";

vi.mock("server-only", () => ({}));

/** Upstream calls ONE stock page needs: quote + quoteSummary + 2 time series. */
const ONE_PAGE = {
  quote: 1,
  quoteSummary: 1,
  timeSeries: 2,
  chart: 0,
  search: 0,
};

describe("cold start: 15 students open the same ticker in the same moment", () => {
  it("baseline: one request costs exactly one quote + one summary + two time-series calls", async () => {
    const { service, client } = makeService({
      client: new FakeYahooClient({ delayMs: 20 }),
    });
    await service.getStock("AAPL");
    expect(client.calls).toEqual(ONE_PAGE);
  });

  it("15 parallel requests on ONE instance cause exactly ONE upstream fetch per resource", async () => {
    const { service, client } = makeService({
      client: new FakeYahooClient({ delayMs: 40 }),
    });
    const results = await Promise.all(
      Array.from({ length: 15 }, () => service.getStock("AAPL")),
    );
    expect(client.calls).toEqual(ONE_PAGE); // not 15x
    expect(results).toHaveLength(15);
    for (const r of results) {
      expect(r.listing.symbol).toBe("AAPL");
      expect(r.meta.stale).toBe(false);
    }
  });

  it("15 parallel requests spread over 5 'serverless instances' sharing one store: still ONE fetch (Redis lock)", async () => {
    const clock = { t: RECORDED_AT.getTime() };
    const store = new MemoryStore(() => clock.t); // stands in for Upstash
    const client = new FakeYahooClient({ delayMs: 60 }); // the one real Yahoo
    // Separate DataService objects = separate in-flight maps, like separate lambdas.
    const instances = Array.from(
      { length: 5 },
      () => makeService({ client, store, clock }).service,
    );
    const results = await Promise.all(
      Array.from({ length: 15 }, (_, i) => instances[i % 5].getStock("AAPL")),
    );
    expect(client.calls).toEqual(ONE_PAGE);
    expect(results.every((r) => r.quote.value?.price.amount === 343.5301)).toBe(
      true,
    );
  });

  it("the same holds for a chart (one fetch per ticker+range) and for search", async () => {
    const { service, client } = makeService({
      client: new FakeYahooClient({ delayMs: 30 }),
    });
    await Promise.all([
      ...Array.from({ length: 15 }, () => service.getChart("AAPL", "1Y")),
      ...Array.from({ length: 15 }, () => service.search("apple")),
    ]);
    expect(client.calls.chart).toBe(1);
    expect(client.calls.search).toBe(1);
    // a different range is a different resource
    await service.getChart("AAPL", "1W");
    expect(client.calls.chart).toBe(2);
  });

  it("after the burst, further requests are cache hits (zero upstream calls)", async () => {
    const { service, client } = makeService();
    await service.getStock("AAPL");
    const before = client.totalCalls;
    await Promise.all(
      Array.from({ length: 15 }, () => service.getStock("AAPL")),
    );
    expect(client.totalCalls).toBe(before);
  });

  it("quote refreshes after 45 s but the 12 h fundamentals are NOT refetched", async () => {
    const { service, client, clock } = makeService();
    await service.getStock("AAPL");
    clock.t += 46_000;
    await service.getStock("AAPL");
    expect(client.calls.quote).toBe(2);
    expect(client.calls.quoteSummary).toBe(1);
    expect(client.calls.timeSeries).toBe(2);
    clock.t += 12 * 3600_000;
    await service.getStock("AAPL");
    expect(client.calls.quoteSummary).toBe(2);
  });
});

describe("degraded mode: serve stale, flag it", () => {
  it("Yahoo dies after a good fetch: the page is served from the stale copy with stale=true", async () => {
    const { service, client, clock } = makeService();
    const good = await service.getStock("AAPL");
    expect(good.meta.stale).toBe(false);

    clock.t += 3 * 3600_000; // quote is soft-expired; fundamentals still fresh
    client.opts.fail = {
      quote: new ProviderError("upstream", "429 Too Many Requests"),
    };
    const stale = await service.getStock("AAPL");
    expect(stale.meta.stale).toBe(true);
    expect(stale.quote.value!.price.amount).toBe(
      good.quote.value!.price.amount,
    );
    expect(stale.fundamentals.value).not.toBeNull();
  });

  it("Yahoo down on a cold ticker: typed upstream error, not a crash", async () => {
    const { service } = makeService({
      client: new FakeYahooClient({
        fail: { quote: new ProviderError("upstream", "429") },
      }),
    });
    await expect(service.getStock("AAPL")).rejects.toMatchObject({
      kind: "upstream",
    });
  });

  it("an unknown ticker is not_found and is remembered", async () => {
    const { service, client } = makeService();
    await expect(service.getStock("NOPE")).rejects.toMatchObject({
      kind: "not_found",
    });
    const calls = client.totalCalls;
    await expect(service.getStock("NOPE")).rejects.toMatchObject({
      kind: "not_found",
    });
    expect(client.totalCalls).toBe(calls);
  });

  it("only the detail bundle failing degrades sections but still returns the page", async () => {
    const { service } = makeService({
      client: new FakeYahooClient({
        fail: {
          quoteSummary: new ProviderError("upstream", "x"),
          timeSeries: new ProviderError("upstream", "x"),
        },
      }),
    });
    const s = await service.getStock("AAPL");
    expect(s.quote.value).not.toBeNull();
    expect(s.fundamentals.reason).toBe("provider_error");
    expect(s.meta.degradedSections).toEqual(
      expect.arrayContaining([
        "fundamentals",
        "earnings",
        "analysts",
        "profile",
      ]),
    );
  });
});

describe("health", () => {
  it("is ok after a success, degraded after one failure, down after three", async () => {
    const { service, client, clock } = makeService();
    await service.getStock("AAPL");
    let h = await service.health();
    expect(h.status).toBe("ok");
    expect(
      h.providers.find((p) => p.name === "yahoo")!.lastSuccessAt,
    ).not.toBeNull();
    expect(JSON.stringify(h)).not.toMatch(/token|secret|key/i);

    client.opts.fail = { chart: new ProviderError("upstream", "429") };
    await expect(service.getChart("AAPL", "1Y")).rejects.toBeDefined();
    h = await service.health();
    expect(h.status).toBe("degraded");
    for (let i = 0; i < 2; i++) {
      clock.t += 11_000; // past the failure cooldown
      await expect(service.getChart("AAPL", "1Y")).rejects.toBeDefined();
    }
    h = await service.health();
    expect(h.status).toBe("down");
    expect(h.providers.find((p) => p.name === "upstash")!.detail).toMatch(
      /in-memory/,
    );
  });
});
