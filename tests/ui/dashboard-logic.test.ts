import { describe, expect, it } from "vitest";
import {
  QUOTES_MAX,
  REFRESH_MS,
  shouldRefresh,
  unionSymbols,
} from "@/lib/data/dashboard";
import { getMarket, getQuotes } from "@/lib/data";
import { rowState } from "@/components/dashboard/row-state";
import type { QuotesResponse } from "@/lib/contract";
import type { PolledResource } from "@/lib/data/hooks";
import {
  changeParts,
  directionOf,
  earningsWhen,
  priceParts,
  selectEarnings,
  sparklineOf,
} from "@/components/dashboard/quote-format";
import { sparklinePoints } from "@/components/dashboard/sparkline";
import { loadMarket, loadQuotes } from "./helpers";

describe("unionSymbols (one batched call for every tile)", () => {
  it("merges watchlist, starters and recents in priority order, de-duplicated", () => {
    const out = unionSymbols(
      [{ symbol: "aapl" }, { symbol: "NVDA" }],
      [{ symbol: "AAPL" }, { symbol: "MC.PA" }],
      [{ symbol: "NVDA" }, { symbol: "TSM" }],
    );
    expect(out).toEqual(["AAPL", "NVDA", "MC.PA", "TSM"]);
  });
  it("keeps every company, even past the API limit (getQuotes splits the call)", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ symbol: `S${i}` }));
    expect(unionSymbols(many)).toHaveLength(40);
  });
  it("a full watchlist, all starters and all recents keep the last recents", () => {
    const watch = Array.from({ length: 12 }, (_, i) => ({ symbol: `W${i}` }));
    const starters = Array.from({ length: 12 }, (_, i) => ({
      symbol: `S${i}`,
    }));
    const recents = Array.from({ length: 6 }, (_, i) => ({ symbol: `R${i}` }));
    const out = unionSymbols(watch, starters, recents);
    expect(out).toContain("R5");
    expect(out.length).toBeGreaterThan(QUOTES_MAX);
  });
  it("is stable: the same set gives the same key", () => {
    const a = unionSymbols([{ symbol: "A" }], [{ symbol: "B" }]);
    const b = unionSymbols([{ symbol: "A" }], [{ symbol: "B" }]);
    expect(a.join()).toBe(b.join());
  });
});

describe("shouldRefresh (polite polling)", () => {
  const base = {
    lastFetchAt: 0,
    now: REFRESH_MS,
    reducedMotion: false,
    hidden: false,
  };
  it("refreshes after 60 s while visible", () =>
    expect(shouldRefresh(base)).toBe(true));
  it("not before 60 s", () =>
    expect(shouldRefresh({ ...base, now: 20_000 })).toBe(false));
  it("paused while the tab is hidden", () =>
    expect(shouldRefresh({ ...base, hidden: true })).toBe(false));
  it("off with prefers-reduced-motion", () =>
    expect(shouldRefresh({ ...base, reducedMotion: true })).toBe(false));
});

describe("dashboard data layer (fixtures)", () => {
  it("quotes: order preserved, unknown symbols are not_found, v0.3.0", async () => {
    const r = await getQuotes(["MC.PA", "aapl", "NOPE"]);
    expect(r.meta.contractVersion).toBe("0.3.0");
    expect(r.entries.map((e) => [e.symbol, e.status])).toEqual([
      ["MC.PA", "ok"],
      ["AAPL", "ok"],
      ["NOPE", "not_found"],
    ]);
    expect(r.meta.stale).toBe(true); // the AAPL fixture is a stale copy
  });
  it("quotes: a list longer than the API limit is split into calls and merged in order", async () => {
    const symbols = ["AAPL", ...Array.from({ length: 29 }, (_, i) => `X${i}`)];
    const r = await getQuotes(symbols);
    expect(r.entries.map((e) => e.symbol)).toEqual(symbols);
    expect(r.entries[0].status).toBe("ok");
    expect(r.entries[29].status).toBe("not_found");
  });
  it("market: 3 chips and 8 index items", async () => {
    const m = await getMarket();
    expect(m.status).toHaveLength(3);
    expect(m.indices).toHaveLength(8);
  });
});

describe("price and change formatting by kind", () => {
  const market = loadMarket();
  const item = (symbol: string) =>
    market.indices.find((i) => i.symbol === symbol)!;
  const q = (symbol: string) => item(symbol).quote.value!;

  it("index: points, no currency", () => {
    const p = priceParts(q("^GSPC"), "en", "index");
    expect(p.unit).toBeNull();
    expect(p.amount).toBe("7,353.73");
  });
  it("fx: 4 decimals, no currency", () => {
    expect(priceParts(q("EURUSD=X"), "en", "fx")).toEqual({
      amount: "1.1221",
      unit: null,
    });
  });
  it("yield: a percent level, change in percentage points (not percent)", () => {
    expect(priceParts(q("^TNX"), "en", "yield")).toEqual({
      amount: "4.84",
      unit: "%",
    });
    const c = changeParts(q("^TNX"), "en", "yield")!;
    expect(c.points).toBe(true);
    expect(c.text).toBe("-0.06");
    expect(c.direction).toBe("down");
  });
  it("future: priced in its own currency", () => {
    expect(priceParts(q("GC=F"), "en", "future").unit).toBe("USD");
    expect(changeParts(q("GC=F"), "en", "future")!.points).toBe(false);
  });
  it("company: yen has no decimals, euro has two; French decimal comma", () => {
    const quotes = loadQuotes();
    const get = (s: string) =>
      quotes.entries.find((e) => e.symbol === s)!.quote.value!;
    expect(priceParts(get("7203.T"), "en")).toEqual({
      amount: "3,533",
      unit: "JPY",
    });
    expect(priceParts(get("MC.PA"), "fr").amount).toBe("418,65");
    expect(changeParts(get("AAPL"), "en")!.direction).toBe("down");
  });
  it("direction is never colour-only: flat / up / down are distinct", () => {
    expect(directionOf(0)).toBe("flat");
    expect(directionOf(null, 0.2)).toBe("up");
    expect(directionOf(undefined)).toBe("flat");
  });
  it("sparkline needs two real points", () => {
    const quotes = loadQuotes();
    const aapl = quotes.entries[0].quote.value!;
    expect(sparklineOf(aapl)!.length).toBeGreaterThan(10);
    expect(
      sparklineOf({
        ...aapl,
        sparkline: { value: null, reason: "provider_error" },
      }),
    ).toBeNull();
    expect(
      sparklineOf({ ...aapl, sparkline: { value: [1], reason: null } }),
    ).toBeNull();
    const pts = sparklinePoints([1, 1, 1]);
    expect(pts).not.toMatch(/NaN/);
    expect(sparklinePoints([1, 2, 3]).split(" ")).toHaveLength(3);
  });
});

describe("earnings dates", () => {
  const at = (iso: string) => ({ date: iso, isEstimate: false });
  // Noon local time, so "today" is unambiguous in any time zone.
  const now = new Date(2026, 10, 5, 12, 0, 0);
  const local = (d: number, h: number) =>
    new Date(2026, 10, d, h, 0, 0).toISOString();

  it("today, already published: 'reported today', never a future date", () =>
    expect(earningsWhen(at(local(5, 7)), now)).toEqual({
      kind: "reportedToday",
    }));
  it("today, not yet: 'reports today'", () =>
    expect(earningsWhen(at(local(5, 20)), now)).toEqual({
      kind: "reportsToday",
    }));
  it("future and recent past", () => {
    expect(earningsWhen(at(local(8, 12)), now)).toEqual({
      kind: "reportsOn",
      days: 3,
    });
    expect(earningsWhen(at(local(4, 12)), now)).toEqual({
      kind: "reportedOn",
      days: -1,
    });
  });
  it("bad date -> null, not a crash", () =>
    expect(earningsWhen(at("garbage"), now)).toBeNull());

  const company = (symbol: string, earnings: ReturnType<typeof at> | null) => ({
    symbol,
    name: symbol,
    exchange: "X",
    earnings,
  });
  it("drops null dates, sorts by date, keeps the 7-day window", () => {
    const r = selectEarnings(
      [
        company("LATE", at(local(30, 12))),
        company("NONE", null),
        company("SOON", at(local(9, 12))),
        company("TODAY", at(local(5, 7))),
      ],
      now,
    );
    expect(r.thisWeek.map((e) => e.symbol)).toEqual(["TODAY", "SOON"]);
    expect(r.upcoming).toEqual([]);
  });
  it("nothing this week: shows the next ones instead of an empty tile", () => {
    const r = selectEarnings(
      [company("A", at(local(25, 12))), company("B", at(local(20, 12)))],
      now,
    );
    expect(r.thisWeek).toEqual([]);
    expect(r.upcoming.map((e) => e.symbol)).toEqual(["B", "A"]);
  });
});

describe("rowState while the symbol set changes (a star was just added)", () => {
  const data = { meta: {}, entries: [] } as unknown as QuotesResponse;
  const ready = (updating?: boolean): PolledResource<QuotesResponse> => ({
    status: "ready",
    data,
    refreshedAt: 0,
    ...(updating ? { updating } : {}),
  });
  it("a company missing from the previous answer is loading, not 'price unavailable'", () =>
    expect(rowState("NVDA", ready(true))).toEqual({ kind: "loading" }));
  it("a company missing from a current answer is unavailable", () =>
    expect(rowState("NVDA", ready())).toEqual({
      kind: "missing",
      reason: "unavailable",
    }));
});
