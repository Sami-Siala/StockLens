import { afterEach, describe, expect, it, vi } from "vitest";
import { getThesis } from "@/lib/data";
import type { AiLanguage } from "@/lib/contract";
import { thesisFixture } from "@/lib/data/ai-fixtures";
import { DataError } from "@/lib/data/errors";
import { liveSource } from "@/lib/data/live";
import { loadStock } from "./helpers";
import { money, moneyCompact, percent, ratio } from "@/lib/ai/format";

afterEach(() => vi.unstubAllGlobals());

/** Intl uses no-break spaces that differ across ICU versions: compare with plain spaces. */
const flat = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

const withState = (aiState: string) =>
  vi.stubGlobal("window", { location: { search: `?aiState=${aiState}` } });

describe("thesis data layer, fixtures twin", () => {
  it("serves AAPL ready in both languages", async () => {
    for (const lang of ["fr", "en"] as AiLanguage[]) {
      const r = await getThesis("aapl", lang);
      expect(r.meta.contractVersion).toBe("0.4.0");
      expect(r.meta.language).toBe(lang);
      expect(r.meta.stale).toBe(false);
      expect(r.symbol).toBe("AAPL");
      expect(r.result.status).toBe("ready");
    }
  });

  it("maps SPY to a fund note and RIVN to insufficient data", async () => {
    expect((await getThesis("SPY", "en")).result).toEqual({
      status: "unavailable",
      reason: "not_applicable_for_type",
    });
    expect((await getThesis("RIVN", "fr")).result).toEqual({
      status: "unavailable",
      reason: "insufficient_data",
    });
  });

  it("other fixture tickers get a short sample with their own name and no figures", async () => {
    const r = await getThesis("MC.PA", "en");
    if (r.result.status !== "ready") throw new Error("expected ready");
    expect(r.result.thesis.whatItDoes).toContain("LVMH");
    expect(JSON.stringify(r.result.thesis)).not.toMatch(/\d/);
  });

  it("?aiState= forces every state", async () => {
    const expectations: Record<string, object> = {
      stale: { status: "ready" },
      no_key: { status: "unavailable", reason: "no_key" },
      model_error: { status: "unavailable", reason: "model_error" },
      not_applicable_for_type: {
        status: "unavailable",
        reason: "not_applicable_for_type",
      },
      insufficient_data: { status: "unavailable", reason: "insufficient_data" },
      quota_exhausted: {
        status: "unavailable",
        reason: "quota_exhausted",
        retryAfter: 10800,
      },
    };
    for (const [state, expected] of Object.entries(expectations)) {
      withState(state);
      const r = await getThesis("AAPL", "en");
      expect(r.result).toMatchObject(expected);
      expect(r.meta.stale).toBe(state === "stale");
      if (r.result.status === "unavailable") {
        expect(r.meta.model).toBeNull();
        expect(r.meta.generatedAt).toBeNull();
      }
    }
  });

  it("an unknown ?aiState= is ignored", async () => {
    withState("banana");
    expect((await getThesis("AAPL", "en")).result.status).toBe("ready");
  });

  it("?aiState=down is a transport error", async () => {
    withState("down");
    await expect(getThesis("AAPL", "en")).rejects.toBeInstanceOf(DataError);
  });

  it("?aiState=loading never answers, and aborts cleanly", async () => {
    withState("loading");
    const c = new AbortController();
    const p = getThesis("AAPL", "en", c.signal);
    let settled = false;
    p.then(
      () => (settled = true),
      () => (settled = true),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(settled).toBe(false);
    c.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("AAPL thesis text matches the AAPL page numbers", () => {
  const stats = loadStock("AAPL").fundamentals.value!.keyStats;
  // The page's free-cash-flow card shows the newest period: the quarter ending Sep 2026.
  const fcf =
    loadStock("AAPL").fundamentals.value!.quarterly.at(-1)!.freeCashFlow.value!;
  const target = loadStock("AAPL").analysts.value!.priceTarget.value!;
  const price = loadStock("AAPL").quote.value!.price.amount;

  it.each(["en", "fr"] as const)("%s", (lang) => {
    const r = thesisFixture("AAPL", lang, "ready");
    if (r.result.status !== "ready") throw new Error("fixture");
    const all = flat(JSON.stringify(r.result.thesis));
    const must = [
      ratio(stats.trailingPE.value!, lang),
      ratio(stats.forwardPE.value!, lang),
      percent(stats.operatingMargin.value!, lang),
      percent(stats.revenueGrowth.value!, lang, { signed: true }),
      percent(stats.payoutRatio.value!, lang),
      percent(stats.dividendYield.value!, lang),
      moneyCompact(fcf, "USD", lang),
      money(target.mean, "USD", lang),
    ];
    for (const s of must) expect(all).toContain(flat(s));
    // "the analyst target is below the share price" is a claim: keep it true.
    expect(target.mean).toBeLessThan(price);
  });
});

describe("thesis data layer, live source", () => {
  const body = (extra: object) => ({
    meta: {},
    symbol: "AAPL",
    result: { status: "unavailable", reason: "quota_exhausted", ...extra },
  });
  const stubFetch = (res: Response) => {
    const fn = vi.fn().mockResolvedValue(res);
    vi.stubGlobal("fetch", fn);
    return fn;
  };

  it("calls /api/ai/{SYMBOL}?lang= and passes an unavailable 200 through", async () => {
    const fn = stubFetch(Response.json(body({ retryAfter: 60 })));
    const r = await liveSource.thesis("^GSPC", "fr");
    expect(fn.mock.calls[0][0]).toBe("/api/ai/%5EGSPC?lang=fr");
    expect(r.result).toMatchObject({ status: "unavailable", retryAfter: 60 });
  });

  it("maps real HTTP errors to DataError", async () => {
    stubFetch(
      Response.json({ error: { code: "bad_request" } }, { status: 400 }),
    );
    await expect(liveSource.thesis("AAPL", "en")).rejects.toMatchObject({
      code: "bad_request",
    });
    stubFetch(new Response("boom", { status: 502 }));
    await expect(liveSource.thesis("AAPL", "en")).rejects.toMatchObject({
      code: "upstream_unavailable",
    });
  });

  it("a network failure is a DataError(network)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(liveSource.thesis("AAPL", "en")).rejects.toMatchObject({
      code: "network",
    });
  });
});
