import { describe, expect, it } from "vitest";
import {
  AnalystSection,
  barPosition,
  groupRatings,
} from "@/components/stock/analyst-section";
import { KeyNumbers } from "@/components/stock/key-numbers";
import { StockHeader } from "@/components/stock/stock-header";
import type { StockSnapshot, UnavailableReason } from "@/lib/contract";
import { BROKEN, loadStock, render, SYMBOLS, visibleText } from "./helpers";

const page = (s: StockSnapshot) => (
  <>
    <StockHeader stock={s} />
    <KeyNumbers stock={s} />
    <AnalystSection stock={s} />
  </>
);

describe.each(["en", "fr"] as const)("stock page sections (%s)", (locale) => {
  it.each(SYMBOLS)("%s renders with no NaN / undefined / null", (symbol) => {
    const text = visibleText(render(page(loadStock(symbol)), locale));
    expect(text).not.toMatch(BROKEN);
    expect(text.length).toBeGreaterThan(200);
  });
});

describe("sparse companies", () => {
  it("ETF: one calm note instead of six empty cards, no analyst bars", () => {
    const text = visibleText(render(page(loadStock("SPY"))));
    expect(text).toContain("This is a fund");
    expect(text).not.toContain("Earnings per share");
    expect(text).toContain("does not apply to this kind of investment");
  });
  it("LVMH: EPS card says why it is missing, revenue falls back to the year", () => {
    const text = visibleText(render(page(loadStock("MC.PA"))));
    expect(text).toContain("Our data source has no value for this company");
    expect(text).toContain("Year ending Dec 2025");
  });
  it("TSM: states the statement currency differs from the share currency", () => {
    const text = visibleText(render(page(loadStock("TSM"))));
    expect(text).toContain("Reported in TWD (the share trades in USD)");
  });
  it("price target in another currency is hidden, not mixed", () => {
    const s = loadStock("TSM");
    s.analysts.value!.priceTarget.value!.currency = "TWD";
    const text = visibleText(render(<AnalystSection stock={s} />));
    expect(text).toContain("different currency");
    expect(text).not.toContain("Lowest");
  });
  it("currency_mismatch reason from the provider also hides targets", () => {
    const s = loadStock("TSM");
    s.analysts.value!.priceTarget = {
      value: null,
      reason: "currency_mismatch",
    };
    expect(visibleText(render(<AnalystSection stock={s} />))).toContain(
      "different currency",
    );
  });
  it.each<UnavailableReason>([
    "not_applicable_for_type",
    "negative_earnings",
    "not_reported",
    "reported_less_often",
    "not_provided_by_source",
    "currency_mismatch",
    "provider_error",
  ])("every section failing with %s still renders a clean page", (reason) => {
    const s = loadStock("AAPL");
    s.quote = { value: null, reason };
    s.fundamentals = { value: null, reason };
    s.earnings = { value: null, reason };
    s.analysts = { value: null, reason };
    for (const locale of ["en", "fr"] as const) {
      const text = visibleText(render(page(s), locale));
      expect(text).not.toMatch(BROKEN);
    }
  });
  it("one failing metric does not blank the rest (loss-maker: no trailing P/E)", () => {
    const s = loadStock("AAPL");
    s.fundamentals.value!.keyStats.trailingPE = {
      value: null,
      reason: "negative_earnings",
    };
    const text = visibleText(render(page(s)));
    expect(text).toContain("The company made a loss");
    expect(text).toContain("Forward");
    expect(text).toContain("Market capitalisation");
  });
});

describe("header", () => {
  it("up/down are never colour only: arrow icon + screen-reader text", () => {
    const html = render(<StockHeader stock={loadStock("MC.PA")} />);
    expect(html).toContain("Up");
    expect(html).toContain("<svg");
    expect(html).toContain("Delayed 15 min");
    expect(html).toContain("Paris:MC.PA");
  });
});

describe("analyst helpers", () => {
  it("groups strong buy + buy and sell + strong sell", () => {
    expect(
      groupRatings({ strongBuy: 6, buy: 18, hold: 13, sell: 3, strongSell: 3 }),
    ).toEqual({
      buy: 24,
      hold: 13,
      sell: 6,
      total: 43,
    });
  });
  it("positions values on the bar and clamps", () => {
    expect(barPosition(5, 0, 10)).toBe(50);
    expect(barPosition(50, 0, 10)).toBe(100);
    expect(barPosition(5, 5, 5)).toBe(50);
  });
});
