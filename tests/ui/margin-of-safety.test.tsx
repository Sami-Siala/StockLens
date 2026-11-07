import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/navigation", () => ({
  Link: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: () => {} }),
  usePathname: () => "/",
}));

import {
  MarginCard,
  marginHiddenReason,
  MarginResult,
} from "@/components/stock/margin-card";
import type { StockSnapshot } from "@/lib/contract";
import {
  cleanEstimate,
  createNotesStore,
  findEntry,
  saveEntry,
} from "@/lib/data/local/notes";
import type { StorageLike } from "@/lib/data/local/store";
import {
  ESTIMATE_MAX,
  isMajorCurrency,
  marginOfSafety,
  parseEstimate,
} from "@/lib/education/margin-of-safety";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { BROKEN, loadStock, render, visibleText } from "./helpers";

const memory = (): StorageLike => {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};
const clone = (s: string): StockSnapshot => structuredClone(loadStock(s));
const unescape = (s: string) =>
  s.replaceAll("&#x27;", "'").replaceAll("&amp;", "&");

describe("parseEstimate", () => {
  const ok = (raw: string, locale = "en") => {
    const r = parseEstimate(raw, locale);
    return r.ok ? r.value : r.problem;
  };
  it("reads a decimal point or comma", () => {
    expect(ok("120")).toBe(120);
    expect(ok("12.5")).toBe(12.5);
    expect(ok("12,5")).toBe(12.5);
    expect(ok("12,5", "fr")).toBe(12.5);
    expect(ok(".5")).toBe(0.5);
    expect(ok("0,75", "fr")).toBe(0.75);
    expect(ok("  42  ")).toBe(42);
  });
  it("reads thousands separators in both conventions", () => {
    expect(ok("1,234.56")).toBe(1234.56);
    expect(ok("1.234,56")).toBe(1234.56);
    expect(ok("1 234,5", "fr")).toBe(1234.5);
    expect(ok("1 234,5", "fr")).toBe(1234.5);
    expect(ok("1 234", "fr")).toBe(1234);
    expect(ok("1'234.5")).toBe(1234.5);
    expect(ok("1,234,567")).toBe(1234567);
    expect(ok("1.234.567", "fr")).toBe(1234567);
    // English "1,234" is a thousand; French "1,234" is 1.234.
    expect(ok("1,234", "en")).toBe(1234);
    expect(ok("1,234", "fr")).toBe(1.234);
  });
  it("accepts a trailing separator while typing", () => {
    expect(ok("12,")).toBe(12);
    expect(ok("12.")).toBe(12);
  });
  it("rejects empty, garbage, mixed and malformed input", () => {
    expect(ok("")).toBe("empty");
    expect(ok("   ")).toBe("empty");
    for (const bad of [
      "abc",
      "12abc",
      "1e5",
      "1e400",
      "NaN",
      "Infinity",
      "$120",
      "120 USD",
      "1,2,3",
      "1.2.3",
      "1,234,56",
      "12..5",
      ",",
      ".",
      "--5",
      "+5",
      "0x10",
      "١٢٣",
      "<script>",
      "5,000.00,1",
    ])
      expect(ok(bad), bad).toBe("invalid");
  });
  it("rejects zero, negatives and too-large numbers", () => {
    expect(ok("0")).toBe("not_positive");
    expect(ok("0.00")).toBe("not_positive");
    expect(ok("-5")).toBe("not_positive");
    expect(ok("-0,5")).toBe("not_positive");
    expect(ok(String(ESTIMATE_MAX))).toBe(ESTIMATE_MAX);
    expect(ok(String(ESTIMATE_MAX + 1))).toBe("too_large");
    expect(ok("9".repeat(30))).toBe("invalid"); // over the length cap
    expect(ok("9".repeat(15))).toBe("too_large");
  });
  it("never throws on odd input types", () => {
    expect(parseEstimate(undefined as never)).toEqual({
      ok: false,
      problem: "invalid",
    });
    expect(parseEstimate(null as never)).toEqual({
      ok: false,
      problem: "invalid",
    });
    expect(parseEstimate(12 as never)).toEqual({
      ok: false,
      problem: "invalid",
    });
  });
});

describe("marginOfSafety", () => {
  it("price below the estimate: positive margin on the estimate's basis", () => {
    const m = marginOfSafety(80, 100)!;
    expect(m.margin).toBeCloseTo(0.2);
    expect(m.upside).toBeCloseTo(0.25);
    expect(m.side).toBe("below");
    expect(m.size).toBeCloseTo(0.2);
    expect(m.farFromPrice).toBe(false);
  });
  it("matches the glossary example (100 estimate, 60 price = 40%)", () => {
    expect(marginOfSafety(60, 100)!.margin).toBeCloseTo(0.4);
    expect(marginOfSafety(95, 100)!.margin).toBeCloseTo(0.05);
  });
  it("price above the estimate: negative margin, side 'above'", () => {
    const m = marginOfSafety(120, 100)!;
    expect(m.margin).toBeCloseTo(-0.2);
    expect(m.size).toBeCloseTo(0.2);
    expect(m.side).toBe("above");
    expect(m.upside).toBeCloseTo(-1 / 6);
  });
  it("about equal under half a percentage point", () => {
    expect(marginOfSafety(100, 100)!.side).toBe("about_equal");
    expect(marginOfSafety(100.3, 100)!.side).toBe("about_equal");
    expect(marginOfSafety(101, 100)!.side).toBe("above");
  });
  it("flags an estimate ten times away from the price (wrong unit or typo)", () => {
    expect(marginOfSafety(37.84, 3784)!.farFromPrice).toBe(true);
    expect(marginOfSafety(37.84, 3.784)!.farFromPrice).toBe(true);
    expect(marginOfSafety(37.84, 40)!.farFromPrice).toBe(false);
  });
  it("unusable numbers give null, never NaN", () => {
    for (const [p, e] of [
      [0, 100],
      [100, 0],
      [-1, 100],
      [100, -1],
      [NaN, 100],
      [100, NaN],
      [Infinity, 100],
      [100, Infinity],
    ] as const)
      expect(marginOfSafety(p, e)).toBeNull();
  });
  it("is the same number whatever the currency (the maths is unit-free)", () => {
    expect(marginOfSafety(3000, 4000)!.margin).toBeCloseTo(
      marginOfSafety(30, 40)!.margin,
    );
  });
});

describe("currency handling", () => {
  it("only plain major-unit codes are accepted", () => {
    for (const c of ["USD", "EUR", "GBP", "JPY", "CHF"])
      expect(isMajorCurrency(c)).toBe(true);
    for (const c of [
      "GBp",
      "ZAc",
      "ILA",
      "",
      "usd",
      "US",
      "USDX",
      null,
      undefined,
      5,
    ])
      expect(isMajorCurrency(c), String(c)).toBe(false);
  });
  it("a London share is asked in pounds, with the pence explained", () => {
    const s = loadStock("SHEL.L");
    expect(s.listing.priceCurrency).toBe("GBP");
    expect(marginHiddenReason(s)).toBeNull();
    const t = unescape(visibleText(render(<MarginCard stock={s} />)));
    expect(t).toContain("in GBP");
    expect(t).toContain("not in GBp");
    expect(t).toContain("100 GBp = 1 GBP");
  });
  it("hides itself, with a reason, when the price or currency is unusable", () => {
    expect(marginHiddenReason(loadStock("SPY"))).toBe("fund");
    expect(marginHiddenReason(loadStock("AAPL"))).toBeNull();
    const noQuote = clone("AAPL");
    noQuote.quote = { value: null, reason: "provider_error" };
    expect(marginHiddenReason(noQuote)).toBe("quote");
    const pence = clone("AAPL");
    pence.listing.priceCurrency = "GBp";
    expect(marginHiddenReason(pence)).toBe("currency");
    const mismatch = clone("AAPL");
    mismatch.quote.value!.price.currency = "EUR";
    expect(marginHiddenReason(mismatch)).toBe("currency");
    const zero = clone("AAPL");
    zero.quote.value!.price.amount = 0;
    expect(marginHiddenReason(zero)).toBe("quote");
    const nan = clone("AAPL");
    nan.quote.value!.price.amount = NaN;
    expect(marginHiddenReason(nan)).toBe("quote");
  });
});

describe("saving the estimate with the notes", () => {
  it("stores amount and currency per symbol and reads them back", () => {
    const s = memory();
    const store = createNotesStore(() => s);
    saveEntry(
      "aapl",
      { estimate: { amount: 412.5, currency: "USD" } },
      store,
      1,
    );
    expect(findEntry(store.read(), "AAPL")).toEqual({
      symbol: "AAPL",
      note: "",
      pick: null,
      estimate: { amount: 412.5, currency: "USD" },
      updatedAt: 1,
    });
    expect(
      findEntry(createNotesStore(() => s).read(), "AAPL")?.estimate?.amount,
    ).toBe(412.5);
  });
  it("keeps the note and pick when only the estimate changes, and the estimate when the note changes", () => {
    const store = createNotesStore(() => memory());
    saveEntry("AAPL", { note: "n", pick: "hold" }, store);
    saveEntry("AAPL", { estimate: { amount: 100, currency: "USD" } }, store);
    saveEntry("AAPL", { note: "n2" }, store);
    expect(findEntry(store.read(), "AAPL")).toMatchObject({
      note: "n2",
      pick: "hold",
      estimate: { amount: 100, currency: "USD" },
    });
  });
  it("an entry holding only an estimate stays; clearing everything removes it", () => {
    const store = createNotesStore(() => memory());
    saveEntry("AAPL", { estimate: { amount: 100, currency: "USD" } }, store);
    saveEntry("AAPL", { note: "  " }, store);
    expect(findEntry(store.read(), "AAPL")).toBeDefined();
    saveEntry("AAPL", { estimate: null }, store);
    expect(store.read()).toEqual([]);
  });
  it("an entry without an estimate has no estimate key (older saved data stays valid)", () => {
    const s = memory();
    s.setItem(
      "stocklens:notes:v1",
      JSON.stringify([
        { symbol: "KO", note: "old", pick: "hold", updatedAt: 3 },
      ]),
    );
    const e = findEntry(createNotesStore(() => s).read(), "KO")!;
    expect(e).toEqual({
      symbol: "KO",
      note: "old",
      pick: "hold",
      updatedAt: 3,
    });
    expect("estimate" in e).toBe(false);
  });
  it("hostile stored estimates are dropped, never trusted", () => {
    for (const bad of [
      { amount: "5", currency: "USD" },
      { amount: NaN, currency: "USD" },
      { amount: -3, currency: "USD" },
      { amount: 0, currency: "USD" },
      { amount: 1e12, currency: "USD" },
      { amount: 5, currency: "usd" },
      { amount: 5, currency: "GBp" },
      { amount: 5, currency: "<script>" },
      { amount: 5 },
      null,
      "x",
      [],
    ])
      expect(cleanEstimate(bad), JSON.stringify(bad)).toBeUndefined();
    expect(cleanEstimate({ amount: 5, currency: "EUR", extra: "<b>" })).toEqual(
      {
        amount: 5,
        currency: "EUR",
      },
    );
    const s = memory();
    s.setItem(
      "stocklens:notes:v1",
      JSON.stringify([
        {
          symbol: "KO",
          note: "x",
          pick: null,
          estimate: { amount: -1, currency: "USD" },
        },
      ]),
    );
    expect(
      findEntry(createNotesStore(() => s).read(), "KO")?.estimate,
    ).toBeUndefined();
  });
  it("saveEntry ignores an unusable estimate", () => {
    const store = createNotesStore(() => memory());
    saveEntry("AAPL", { note: "n" }, store);
    saveEntry("AAPL", { estimate: { amount: NaN, currency: "USD" } }, store);
    expect(findEntry(store.read(), "AAPL")?.estimate).toBeUndefined();
  });
  it("works without storage (memory)", () => {
    const store = createNotesStore(() => null);
    saveEntry("AAPL", { estimate: { amount: 9, currency: "USD" } }, store);
    expect(findEntry(store.read(), "AAPL")?.estimate?.amount).toBe(9);
  });
});

describe.each(["en", "fr"] as const)("margin card (%s)", (locale) => {
  const m = (locale === "en" ? en : fr).Safety;

  it("shows the label with the currency, a text input and the not-advice line", () => {
    const html = render(<MarginCard stock={loadStock("AAPL")} />, locale);
    const t = unescape(visibleText(html));
    expect(t).toContain(m.title);
    expect(t).toContain(m.label.replace("{currency}", "USD"));
    expect(html).toContain('inputMode="decimal"');
    expect(html).toContain('type="text"');
    expect(html).toContain('href="/learn#margin_of_safety"');
    expect(t).toContain(m.notAdvice);
    // Séance 4 tag.
    expect(t).toMatch(/S[ée]ance 4|Session 4/);
    expect(t).not.toMatch(BROKEN);
  });
  it("explains why it is hidden for a fund", () => {
    const html = render(<MarginCard stock={loadStock("SPY")} />, locale);
    expect(unescape(visibleText(html))).toContain(m.hidden.fund);
    expect(html).not.toContain("<input");
  });
  it("renders the result sentence for an estimate above and below the price", () => {
    const below = unescape(
      visibleText(
        render(
          <MarginResult
            price={343.53}
            value={412.5}
            currency="USD"
            result={marginOfSafety(343.53, 412.5)!}
          />,
          locale,
        ),
      ),
    );
    expect(below).toContain(locale === "en" ? "16.7%" : "16,7");
    expect(below).toContain(
      locale === "en" ? "below your estimate" : "inférieur de",
    );
    expect(below).toContain(
      locale === "en" ? "Your estimate is 20.1% above" : "supérieure de 20,1",
    );
    expect(below).not.toMatch(BROKEN);
    const above = unescape(
      visibleText(
        render(
          <MarginResult
            price={400}
            value={300}
            currency="USD"
            result={marginOfSafety(400, 300)!}
          />,
          locale,
        ),
      ),
    );
    expect(above).toContain(
      locale === "en" ? "above your estimate" : "supérieur de",
    );
    expect(above).toContain(
      locale === "en" ? "no margin of safety" : "pas de marge de sécurité",
    );
    expect(above).toMatch(/[-−]33[.,]3/);
  });
  it("warns when the estimate is far from the price", () => {
    const t = unescape(
      visibleText(
        render(
          <MarginResult
            price={37.84}
            value={3784}
            currency="GBP"
            result={marginOfSafety(37.84, 3784)!}
          />,
          locale,
        ),
      ),
    );
    expect(t).toContain(m.far);
  });
});

describe("Safety wording", () => {
  const leaves = (n: unknown): string[] =>
    n && typeof n === "object" ? Object.values(n).flatMap(leaves) : [String(n)];
  const keys = (node: unknown, prefix = ""): string[] =>
    node && typeof node === "object"
      ? Object.entries(node).flatMap(([k, v]) =>
          keys(v, prefix ? `${prefix}.${k}` : k),
        )
      : [prefix];
  const ADVICE =
    /\b(buy|sell|acheter|achetez|achète|vendez|vendre)\b|you should|vous devriez|invest now|investissez/i;
  it("has the same keys in French and English", () => {
    expect(keys(fr.Safety).sort()).toEqual(keys(en.Safety).sort());
  });
  it("is never an instruction, and always says it is the student's own estimate", () => {
    for (const [lang, mm] of [
      ["en", en],
      ["fr", fr],
    ] as const)
      for (const s of leaves(mm.Safety)) {
        expect(s, lang).not.toMatch(ADVICE);
        expect(s, lang).not.toMatch(BROKEN);
        expect(s.trim()).not.toBe("");
      }
    expect(en.Safety.notAdvice).toMatch(
      /your estimate, not a prediction or advice/,
    );
    expect(fr.Safety.notAdvice).toMatch(
      /votre estimation, pas une prédiction ni un conseil/,
    );
  });
});
