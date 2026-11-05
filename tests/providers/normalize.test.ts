import { describe, expect, it, vi } from "vitest";
import type { StockSnapshot } from "@/lib/contract";
import { composeStock } from "@/lib/providers/normalize/compose";
import { YahooProvider } from "@/lib/providers/yahoo";
import { FakeYahooClient } from "../helpers/fake-yahoo";
import { RECORDED_AT } from "../helpers/setup";

vi.mock("server-only", () => ({}));

/** Build a snapshot from recorded payloads, optionally at another "now". */
async function snapshot(symbol: string, now = RECORDED_AT) {
  const p = new YahooProvider(new FakeYahooClient(), () => now);
  const [core, detail] = await Promise.all([
    p.getCore(symbol),
    p.getDetail(symbol),
  ]);
  return { core, detail, ...composeStock(core, detail, now) };
}

describe("AAPL (the complete case)", async () => {
  const s = await snapshot("AAPL");
  const ks = s.fundamentals.value!.keyStats;

  it("listing and quote", () => {
    expect(s.listing).toMatchObject({
      symbol: "AAPL",
      quoteType: "EQUITY",
      priceCurrency: "USD",
      financialCurrency: "USD",
      exchangeTimezone: "America/New_York",
      priceSubunit: null,
    });
    const q = s.quote.value!;
    expect(q.price).toEqual({ amount: 343.5301, currency: "USD" });
    expect(q.delayMinutes).toBe(15);
    expect(q.marketState).toBe("REGULAR");
  });
  it("converts Yahoo's mixed percent units to fractions", () => {
    // quote(): -1.7109437 (percent) -> -0.017109437 ; summaryDetail: 0.0031 stays a fraction
    expect(s.quote.value!.changePercent).toBeCloseTo(-0.017109, 5);
    expect(ks.dividendYield.value).toBeCloseTo(0.0031, 6);
    expect(ks.payoutRatio.value).toBeLessThan(1);
  });
  it("EPS actual vs estimate (earningsHistory), surprise as a fraction", () => {
    const last = s.earnings.value!.lastQuarter.value!;
    expect(last.epsActual).toBe(2.1);
    expect(last.surprise).toBeCloseTo(0.0575, 3);
    expect(s.earnings.value!.history.length).toBeLessThanOrEqual(4);
    const dates = s.earnings.value!.history.map((h) => h.quarterEnd);
    expect(dates).toEqual([...dates].sort());
  });
  it("forward estimates exist, but there is NO past revenue beat/miss", () => {
    const e = s.earnings.value!;
    expect(e.revenueEstimates.length).toBeGreaterThan(0);
    expect(e.epsEstimates.length).toBeGreaterThan(0);
    expect(JSON.stringify(e)).not.toMatch(/revenueActual|revenueSurprise/);
  });
  it("statements come from the time series, oldest first", () => {
    const f = s.fundamentals.value!;
    expect(f.primaryView).toBe("quarterly");
    expect(f.quarterly.length).toBeGreaterThanOrEqual(4);
    expect(f.annual).toHaveLength(3);
    const ends = f.annual.map((p) => p.periodEnd);
    expect(ends).toEqual([...ends].sort());
    expect(f.annual.at(-1)!.revenue.value).toBe(478834000000);
    expect(f.annual.at(-1)!.length).toBe("12M");
  });
  it("analyst view", () => {
    const a = s.analysts.value!;
    expect(a.ratings.value).toEqual({
      strongBuy: 6,
      buy: 18,
      hold: 13,
      sell: 3,
      strongSell: 3,
    });
    expect(a.priceTarget.value).toMatchObject({
      low: 250,
      high: 405,
      analysts: 38,
      currency: "USD",
    });
  });
  it("drops a 'next earnings' date that is in the past, keeps the future one", () => {
    // Yahoo's quote still carries 2026-11-02 (past); calendarEvents has 2027-01-28.
    expect(s.earnings.value!.next.value).toEqual({
      date: "2027-01-28T21:00:00.000Z",
      isEstimate: true,
    });
  });
  it("has no degraded sections", () => expect(s.degraded).toEqual([]));
});

describe("MC.PA (semi-annual reporter, EUR)", async () => {
  const s = await snapshot("MC.PA");
  it("quarterly rows are hollow -> reported_less_often, annual is used", () => {
    const f = s.fundamentals.value!;
    expect(f.primaryView).toBe("annual");
    expect(f.quarterly.length).toBeGreaterThan(0);
    for (const row of f.quarterly) {
      expect(row.revenue).toEqual({
        value: null,
        reason: "reported_less_often",
      });
      expect(row.netIncome.reason).toBe("reported_less_often");
    }
    expect(f.annual.at(-1)!.revenue.value).toBe(80807000000);
  });
  it("empty earningsHistory -> EPS-vs-estimate card is blank with a reason", () => {
    expect(s.earnings.value!.lastQuarter).toEqual({
      value: null,
      reason: "not_provided_by_source",
    });
    expect(s.earnings.value!.history).toEqual([]);
  });
  it("a stale 'next earnings' date (July, now is November) is dropped", () => {
    expect(s.earnings.value!.next.value).toBeNull();
    expect(s.earnings.value!.next.reason).toBe("not_provided_by_source");
  });
  it("dividend yield: summaryDetail fraction, not the quote's percent", () => {
    expect(s.fundamentals.value!.keyStats.dividendYield.value).toBeCloseTo(
      0.0312,
      4,
    );
  });
});

describe("7203.T (Tokyo, JPY)", async () => {
  const s = await snapshot("7203.T");
  it("JPY, Tokyo timezone, delay straight from Yahoo (20 min, not a fixed 15)", () => {
    expect(s.listing.priceCurrency).toBe("JPY");
    expect(s.listing.exchangeTimezone).toBe("Asia/Tokyo");
    expect(s.quote.value!.delayMinutes).toBe(20);
    expect(s.quote.value!.marketState).toBe("CLOSED"); // PREPRE -> CLOSED
  });
  it("a big earnings-day move is passed through, not treated as an error", () => {
    expect(s.quote.value!.changePercent).toBeCloseTo(0.1668, 3);
  });
});

describe("TSM (ADR: USD price, TWD statements)", async () => {
  const s = await snapshot("TSM");
  it("three currencies are kept apart", () => {
    expect(s.listing.priceCurrency).toBe("USD");
    expect(s.listing.financialCurrency).toBe("TWD");
    expect(s.fundamentals.value!.financialCurrency).toBe("TWD");
    expect(s.analysts.value!.priceTarget.value!.currency).toBe("USD");
  });
  it("revenue estimates are TWD while EPS estimates are USD", () => {
    const e = s.earnings.value!;
    expect(e.revenueEstimates[0].currency).toBe("TWD");
    expect(e.epsEstimates[0].currency).toBe("USD");
  });
  it("EPS is on the ADR/USD basis, so P/E stays usable", () => {
    const ks = s.fundamentals.value!.keyStats;
    expect(ks.trailingEps.value).toEqual({ amount: 15.43, currency: "USD" });
    expect(ks.trailingPE.value).toBeCloseTo(23.25, 1);
  });
  it("plausibility guard: a target in another currency is hidden, not shown", async () => {
    // Same analysts, but pretend the price were quoted in a currency 100x smaller.
    const { core, detail } = await snapshot("TSM");
    const bad = { ...core, raw: { ...core.raw, priceQuoted: 3.58 } };
    const c = composeStock(bad, detail, RECORDED_AT);
    expect(c.analysts.value!.priceTarget).toEqual({
      value: null,
      reason: "currency_mismatch",
    });
  });
});

describe("SPY (ETF: sparse by design)", async () => {
  const s = await snapshot("SPY");
  it("quote and profile work; type-specific sections are not_applicable_for_type", () => {
    expect(s.listing.quoteType).toBe("ETF");
    expect(s.quote.value!.price.amount).toBeGreaterThan(0);
    expect(s.profile.value).not.toBeNull();
    for (const sec of [s.fundamentals, s.earnings, s.analysts])
      expect(sec).toEqual({ value: null, reason: "not_applicable_for_type" });
  });
  it("an ETF is not a provider failure", () => expect(s.degraded).toEqual([]));
});

describe("JPM (bank: no operating income line)", async () => {
  const s = await snapshot("JPM");
  it("missing statement lines are not_reported, present ones stay", () => {
    const q = s.fundamentals.value!.quarterly.at(-1)!;
    expect(q.revenue.value).toBeGreaterThan(0);
    expect(q.operatingIncome).toEqual({ value: null, reason: "not_reported" });
    expect(s.fundamentals.value!.primaryView).toBe("quarterly");
  });
});

describe("RIVN (loss-maker)", async () => {
  const s = await snapshot("RIVN");
  const ks = s.fundamentals.value!.keyStats;
  it("P/E is negative_earnings (trailing absent, forward negative), EPS stays visible", () => {
    expect(ks.trailingPE).toEqual({ value: null, reason: "negative_earnings" });
    expect(ks.forwardPE).toEqual({ value: null, reason: "negative_earnings" });
    expect(ks.trailingEps.value!.amount).toBeLessThan(0);
  });
  it("a company that pays no dividend: yield is a true 0, rate/payout are not_reported", () => {
    expect(ks.dividendYield.value).toBe(0);
    expect(ks.dividendRate.reason).toBe("not_reported");
    expect(ks.payoutRatio.reason).toBe("not_reported");
  });
  it("a missed-then-beaten negative estimate gets a positive surprise", () => {
    const last = s.earnings.value!.lastQuarter.value!;
    expect(last.epsActual).toBeLessThan(0);
    expect(last.surprise).toBeGreaterThan(0);
  });
});

describe("SHEL.L (London: pence, USD statements)", async () => {
  const s = await snapshot("SHEL.L");
  it("GBp is converted to GBP everywhere and the conversion is disclosed", () => {
    expect(s.listing.priceCurrency).toBe("GBP");
    expect(s.listing.priceSubunit).toEqual({ quotedAs: "GBp", factor: 100 });
    expect(s.quote.value!.price).toEqual({ amount: 37.84, currency: "GBP" });
    expect(s.quote.value!.fiftyTwoWeekHigh).toBe(41.1);
    expect(s.quote.value!.change).toBeCloseTo(-0.115, 6);
  });
  it("analyst target shares the price's (scaled) unit", () => {
    const t = s.analysts.value!.priceTarget.value!;
    expect(t.currency).toBe("GBP");
    expect(t.mean).toBeCloseTo(41.04302, 4);
    expect(t.mean / 37.84).toBeGreaterThan(0.2);
    expect(t.mean / 37.84).toBeLessThan(5);
  });
  it("EPS is in USD (statement currency) so price/EPS would mix currencies: P/E hidden", () => {
    const ks = s.fundamentals.value!.keyStats;
    expect(ks.trailingEps.value!.currency).toBe("USD");
    expect(ks.trailingPE).toEqual({ value: null, reason: "currency_mismatch" });
    expect(ks.forwardPE).toEqual({ value: null, reason: "currency_mismatch" });
  });
  it("market cap and dividend are verified against shares / yield, in GBP", () => {
    const ks = s.fundamentals.value!.keyStats;
    expect(ks.marketCap.value).toEqual({
      amount: 214444670976,
      currency: "GBP",
    });
    expect(ks.dividendRate.value).toEqual({ amount: 1.16, currency: "GBP" });
  });
});

describe("degradation: one bad module never takes the page down", () => {
  it("a mangled financialData module hides targets, keeps the rest", async () => {
    const client = new FakeYahooClient();
    const orig = client.quoteSummary.bind(client);
    client.quoteSummary = async (sym, mods) => {
      const r = (await orig(sym, mods)) as Record<string, unknown>;
      return { ...r, financialData: "<html>oops</html>" };
    };
    const p = new YahooProvider(client, () => RECORDED_AT);
    const c = composeStock(
      await p.getCore("AAPL"),
      await p.getDetail("AAPL"),
      RECORDED_AT,
    );
    expect(c.degraded).toContain("fundamentals");
    expect(c.analysts.value!.priceTarget.reason).toBe("not_provided_by_source");
    expect(c.analysts.value!.ratings.value).not.toBeNull();
    expect(c.earnings.value!.lastQuarter.value).not.toBeNull();
    expect(c.fundamentals.value!.keyStats.operatingMargin.reason).toBe(
      "provider_error",
    );
    expect(c.fundamentals.value!.annual.length).toBe(3);
  });

  it("quoteSummary failing entirely: statements survive, summary sections are provider_error", async () => {
    const client = new FakeYahooClient({
      fail: {
        quoteSummary: new (
          await import("@/lib/providers/errors")
        ).ProviderError("upstream", "boom"),
      },
    });
    const p = new YahooProvider(client, () => RECORDED_AT);
    const detail = await p.getDetail("AAPL");
    const c = composeStock(await p.getCore("AAPL"), detail, RECORDED_AT);
    expect(c.profile).toEqual({ value: null, reason: "provider_error" });
    expect(c.earnings.reason).toBe("provider_error");
    expect(c.analysts.reason).toBe("provider_error");
    expect(c.fundamentals.value!.annual).toHaveLength(3);
    expect(c.degraded).toEqual(
      expect.arrayContaining(["profile", "earnings", "analysts"]),
    );
  });

  it("no detail at all (cache miss + Yahoo down): every section is provider_error, quote survives", async () => {
    const p = new YahooProvider(new FakeYahooClient(), () => RECORDED_AT);
    const c = composeStock(await p.getCore("AAPL"), null, RECORDED_AT);
    expect(c.quote.value).not.toBeNull();
    for (const sec of [c.profile, c.fundamentals, c.earnings, c.analysts])
      expect(sec.reason).toBe("provider_error");
  });
});

describe("every Metric obeys the contract", () => {
  it.each(["AAPL", "MC.PA", "7203.T", "TSM", "SPY", "JPM", "RIVN", "SHEL.L"])(
    "%s: value XOR reason, no NaN / undefined anywhere",
    async (symbol) => {
      const s = (await snapshot(symbol)) as unknown as StockSnapshot;
      const text = JSON.stringify(s);
      expect(text).not.toMatch(/NaN|undefined|Infinity/);
      const walk = (n: unknown): void => {
        if (Array.isArray(n)) return n.forEach(walk);
        if (!n || typeof n !== "object") return;
        const o = n as Record<string, unknown>;
        if ("value" in o && "reason" in o && Object.keys(o).length === 2)
          expect(o.value === null).toBe(o.reason !== null);
        Object.values(o).forEach(walk);
      };
      walk(s);
    },
  );
});

describe("next-earnings date handling", () => {
  it("keeps a date from the last 2 days (the report may just have happened), drops older ones", async () => {
    // Toyota reported 2026-11-05T06:30Z.
    const sameDay = await snapshot("7203.T", new Date("2026-11-06T20:00:00Z"));
    expect(sameDay.earnings.value!.next.value?.date).toBe(
      "2026-11-05T06:30:00.000Z",
    );
    const later = await snapshot("7203.T", new Date("2026-11-08T12:00:00Z"));
    expect(later.earnings.value!.next).toEqual({
      value: null,
      reason: "not_provided_by_source",
    });
  });
  it("prefers the earliest FUTURE date over a recent past one", async () => {
    const s = await snapshot("AAPL", new Date("2026-11-03T12:00:00Z")); // 2026-11-02 is 1 day old
    expect(s.earnings.value!.next.value?.date).toBe("2027-01-28T21:00:00.000Z");
  });
});

describe("non-equities whose fundamentals calls fail are not 'degraded'", () => {
  it("ETF with failing time-series + summary calls still reports no degraded sections", async () => {
    const { ProviderError } = await import("@/lib/providers/errors");
    const client = new FakeYahooClient({
      fail: { timeSeries: new ProviderError("upstream", "x") },
    });
    const p = new YahooProvider(client, () => RECORDED_AT);
    const c = composeStock(
      await p.getCore("SPY"),
      await p.getDetail("SPY"),
      RECORDED_AT,
    );
    expect(c.fundamentals.reason).toBe("not_applicable_for_type");
    expect(c.degraded).toEqual([]);
  });
});
