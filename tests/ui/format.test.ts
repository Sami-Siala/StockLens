import { describe, expect, it } from "vitest";
import {
  formatMoney,
  formatNumber,
  formatPercent,
  withAlpha,
} from "@/components/format";

describe("formatMoney", () => {
  it("always shows the currency code", () => {
    expect(formatMoney(343.53, "USD", "en")).toBe("USD 343.53");
    expect(formatMoney(418.65, "EUR", "fr")).toMatch(/418,65\sEUR/);
  });
  it("keeps pence as GBp, never as pounds", () => {
    const s = formatMoney(1234.5, "GBp", "en");
    expect(s).toContain("GBp");
    expect(s).not.toContain("£");
    expect(s).not.toContain("GBP");
  });
  it("handles unknown codes and compact values without NaN", () => {
    expect(formatMoney(5, "XXY", "en")).toContain("XXY");
    expect(formatMoney(4.99e12, "USD", "en", { compact: true })).toBe(
      "USD 4.99T",
    );
    expect(formatMoney(Number.NaN, "USD", "en")).toBe("");
  });
});

describe("percent and number", () => {
  it("treats ratios as fractions", () => {
    expect(formatPercent(0.0575, "en")).toBe("5.8%");
    expect(formatPercent(-0.0171, "en", { signed: true, digits: 2 })).toMatch(
      /-1\.71%|−1\.71%/,
    );
    expect(formatPercent(Number.POSITIVE_INFINITY, "en")).toBe("");
    expect(formatNumber(Number.NaN, "en")).toBe("");
  });
  it("withAlpha converts hex tokens", () => {
    expect(withAlpha("#1a7f37", 0.2)).toBe("rgba(26,127,55,0.2)");
    expect(withAlpha("red", 0.2)).toBe("red");
  });
});
