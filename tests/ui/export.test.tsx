import { createTranslator } from "next-intl";
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

import { ExportActions, PrintSheet } from "@/components/stock/export-actions";
import {
  buildExportDoc,
  keyRows,
  type Translate,
} from "@/components/stock/export-model";
import type { StockSnapshot, Thesis } from "@/lib/contract";
import type { NoteEntry } from "@/lib/data/local/notes";
import {
  buildThesisText,
  EXPORT_ITEM_MAX,
  plainText,
} from "@/lib/education/export";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { BROKEN, loadStock, render, visibleText } from "./helpers";

const NOW = new Date("2026-11-07T10:00:00Z");
const MESSAGES = { en, fr } as const;
const clone = (s: string): StockSnapshot => structuredClone(loadStock(s));

function translators(locale: "en" | "fr") {
  const t = createTranslator({
    locale,
    messages: MESSAGES[locale],
    namespace: "Export",
  });
  const pick = createTranslator({
    locale,
    messages: MESSAGES[locale],
    namespace: "Turn.pick",
  });
  return {
    t: ((k, v) => t(k as never, v as never)) as Translate,
    pickLabel: (p: "buy" | "hold" | "sell") => pick(p),
  };
}

const THESIS: Thesis = {
  whatItDoes: "x",
  howItMakesMoney: "y",
  bullCase: ["Loyal customers", "Services growth"],
  bearCase: ["High price"],
  holdCase: ["Wait for the next report"],
  keyRisks: [],
  whatToWatch: [],
  glossaryTerms: [],
};
const ENTRY: NoteEntry = {
  symbol: "AAPL",
  note: "Makes phones.\nI can explain it to a 10-year-old.",
  pick: "hold",
  estimate: { amount: 412.5, currency: "USD" },
  updatedAt: 1,
};

const doc = (
  stock: StockSnapshot,
  locale: "en" | "fr" = "en",
  extra: { entry?: NoteEntry; thesis?: Thesis | null } = {},
) =>
  buildExportDoc({
    stock,
    locale,
    now: NOW,
    ...translators(locale),
    ...extra,
  });

const unescape = (s: string) =>
  s
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");

describe("plainText", () => {
  it("keeps text, drops control characters, unifies line breaks, caps length", () => {
    expect(plainText("a\r\nb\rc")).toBe("a\nb\nc");
    expect(plainText("a\u0000b\u0007c\u001bd")).toBe("a b c d");
    expect(plainText("a b")).toBe("a b");
    expect(plainText("a\n\n\n\n\nb")).toBe("a\n\nb");
    expect(plainText("  hi  ")).toBe("hi");
    expect(plainText("x".repeat(EXPORT_ITEM_MAX + 50))).toHaveLength(
      EXPORT_ITEM_MAX,
    );
    expect(plainText(42)).toBe("");
    expect(plainText(null)).toBe("");
  });
  it("does not rewrite markup: it is text, shown as typed", () => {
    expect(plainText("<b>x</b> **y**")).toBe("<b>x</b> **y**");
  });
});

describe("buildThesisText", () => {
  it("has every part of the one-page summary, in order (EN, full data)", () => {
    const text = buildThesisText(
      doc(loadStock("AAPL"), "en", { entry: ENTRY, thesis: THESIS }),
    );
    const at = (s: string) => {
      const i = text.indexOf(s);
      expect(i, s).toBeGreaterThanOrEqual(0);
      return i;
    };
    const order = [
      at("StockLens: one-page summary"),
      at("Apple Inc."),
      at("NasdaqGS:AAPL"),
      at("Date: November 7, 2026"),
      at("Price: USD 343.53"),
      at("KEY NUMBERS"),
      at("EPS, latest quarter"),
      at("P/E (trailing / forward)"),
      at("Market capitalisation"),
      at("YOUR VIEW"),
      at("Your pick: Hold (your own conclusion, not advice)"),
      at("Makes phones."),
      at("YOUR VALUE ESTIMATE"),
      at("USD 412.50"),
      at("ARGUMENTS WRITTEN BY AN AI"),
      at("Loyal customers"),
      at("Educational content, not financial advice."),
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(text).not.toMatch(BROKEN);
  });
  it("states exchange, ticker, currency, and that the price is delayed", () => {
    const text = buildThesisText(doc(loadStock("AAPL")));
    expect(text).toContain("NasdaqGS:AAPL - USD");
    expect(text).toContain("delayed by 15 min");
    expect(buildThesisText(doc(loadStock("SPY")))).toContain("real time");
  });
  it("includes the key numbers the page shows, formatted for the locale", () => {
    const en = buildThesisText(doc(loadStock("AAPL"), "en"));
    expect(en).toContain("USD 2.10, expected USD 1.99 (beat)");
    expect(en).toContain("38.3 / 32.3");
    expect(en).toContain(
      "Analyst price target (lowest / average / highest): USD 250.00 / USD 333.28 / USD 405.00",
    );
    const fr = buildThesisText(doc(loadStock("AAPL"), "fr"));
    expect(fr).toContain("38,3 / 32,3");
    expect(fr).toContain("BPA, dernier trimestre");
    expect(fr).toContain("Capitalisation boursière");
    expect(fr).toContain("Contenu pédagogique, pas un conseil financier.");
    expect(fr).toContain("Cours :");
  });
  it("works for a fund: no key numbers, a plain sentence instead, no estimate", () => {
    const text = buildThesisText(doc(loadStock("SPY")));
    expect(text).toContain("No key numbers are available for this company.");
    expect(text).toContain(
      "Pick: ".replace("Pick: ", "Your pick: No pick yet"),
    );
    expect(text).not.toMatch(BROKEN);
  });
  it("works for a share with sparse data (loss-maker, no P/E)", () => {
    const rows = keyRows(loadStock("RIVN"), "en", translators("en").t);
    expect(rows.map((r) => r.label)).not.toContain("P/E (trailing / forward)");
    expect(rows.length).toBeGreaterThan(2);
    const s = clone("RIVN");
    s.fundamentals = { value: null, reason: "provider_error" };
    s.earnings = { value: null, reason: "provider_error" };
    s.analysts = { value: null, reason: "provider_error" };
    s.quote = { value: null, reason: "provider_error" };
    const text = buildThesisText(doc(s));
    expect(text).toContain("No key numbers are available");
    expect(text).not.toContain("Price:");
    expect(text).not.toMatch(BROKEN);
  });
  it("a London share keeps its price in pounds and a report currency note", () => {
    const text = buildThesisText(doc(loadStock("SHEL.L")));
    expect(text).toContain(
      "LSE:SHEL.L - GBP".replace("LSE", loadStock("SHEL.L").listing.exchange),
    );
    expect(text).toContain("Price: GBP 37.84");
    // Statements are in USD while the price is in GBP: said, not converted.
    expect(text).toContain("reported in USD");
    expect(text).not.toMatch(BROKEN);
  });
  it("hides a price target quoted in another currency, as the page does", () => {
    const s = clone("AAPL");
    s.analysts.value!.priceTarget.value!.currency = "TWD";
    const text = buildThesisText(doc(s));
    expect(text).not.toContain("Analyst price target");
  });
  it("NaN and missing numbers never reach the text", () => {
    const s = clone("AAPL");
    const k = s.fundamentals.value!.keyStats;
    k.trailingPE = { value: NaN, reason: null };
    k.forwardPE = { value: null, reason: "negative_earnings" };
    s.earnings.value!.lastQuarter.value!.epsActual = NaN;
    s.quote.value!.price.amount = NaN;
    const text = buildThesisText(doc(s));
    expect(text).not.toMatch(BROKEN);
    expect(text).not.toContain("P/E (trailing");
    expect(text).not.toContain("Price:");
  });
});

describe("notes, pick and estimate", () => {
  it("shows the pick as the student's own conclusion, never as advice", () => {
    for (const p of ["buy", "hold", "sell"] as const) {
      const text = buildThesisText(
        doc(loadStock("AAPL"), "en", { entry: { ...ENTRY, pick: p } }),
      );
      expect(text).toMatch(
        /Your pick: \w+ \(your own conclusion, not advice\)/,
      );
    }
    const none = buildThesisText(
      doc(loadStock("AAPL"), "en", { entry: { ...ENTRY, pick: null } }),
    );
    expect(none).toContain("No pick yet");
  });
  it("includes the estimate with the margin sentence and a not-advice line; drops it if the currency changed", () => {
    const text = buildThesisText(
      doc(loadStock("AAPL"), "en", { entry: ENTRY }),
    );
    expect(text).toContain("The price is 16.7% below your estimate");
    expect(text).toContain("not a prediction or advice");
    const gbp = buildThesisText(
      doc(loadStock("AAPL"), "en", {
        entry: { ...ENTRY, estimate: { amount: 100, currency: "GBP" } },
      }),
    );
    expect(gbp).not.toContain("YOUR VALUE ESTIMATE");
    const noEstimate = buildThesisText(
      doc(loadStock("AAPL"), "en", {
        entry: { ...ENTRY, estimate: undefined },
      }),
    );
    expect(noEstimate).not.toContain("YOUR VALUE ESTIMATE");
  });
  it("no price -> the estimate is not compared with anything", () => {
    const s = clone("AAPL");
    s.quote = { value: null, reason: "provider_error" };
    expect(buildThesisText(doc(s, "en", { entry: ENTRY }))).not.toContain(
      "YOUR VALUE ESTIMATE",
    );
  });
  it("notes with markup or control characters are exported as plain text", () => {
    const text = buildThesisText(
      doc(loadStock("AAPL"), "en", {
        entry: {
          ...ENTRY,
          note: "<script>alert(1)</script>\u0000 **bold**\r\nline2",
        },
      }),
    );
    expect(text).toContain("<script>alert(1)</script>  **bold**\nline2");
    expect(text).not.toContain("\u0000");
    expect(text).not.toContain("\r");
  });
  it("empty notes say so", () => {
    expect(buildThesisText(doc(loadStock("AAPL")))).toContain("No notes yet.");
    expect(buildThesisText(doc(loadStock("AAPL"), "fr"))).toContain(
      "Pas encore de notes.",
    );
  });
});

describe("the AI part", () => {
  it("is absent when the AI is hidden or unavailable (thesis null)", () => {
    for (const thesis of [null, undefined]) {
      const text = buildThesisText(
        doc(loadStock("AAPL"), "en", { entry: ENTRY, thesis }),
      );
      expect(text).not.toContain("ARGUMENTS WRITTEN BY AN AI");
      expect(text).not.toContain("Loyal customers");
    }
  });
  it("is present, labelled as AI text, when the thesis is loaded and visible", () => {
    const text = buildThesisText(
      doc(loadStock("AAPL"), "en", { thesis: THESIS }),
    );
    expect(text).toContain(
      "Arguments for\n- Loyal customers\n- Services growth",
    );
    expect(text).toContain("Arguments against\n- High price");
    expect(text).toContain("Arguments for waiting\n- Wait for the next report");
    expect(text).toContain("it can make mistakes");
    expect(text).toContain("arguments to evaluate, not advice");
  });
  it("takes at most two arguments per column, so the summary stays about one page", () => {
    const long = { ...THESIS, bullCase: ["a1", "a2", "a3", "a4"] };
    const text = buildThesisText(
      doc(loadStock("AAPL"), "en", { thesis: long }),
    );
    expect(text).toContain("- a2");
    expect(text).not.toContain("- a3");
  });
  it("skips an empty thesis, drops non-string items and caps long ones", () => {
    const empty = { ...THESIS, bullCase: [], bearCase: [], holdCase: [] };
    expect(
      buildThesisText(doc(loadStock("AAPL"), "en", { thesis: empty })),
    ).not.toContain("ARGUMENTS WRITTEN");
    const junk = {
      ...THESIS,
      bullCase: ["ok", 5, null, "", "x".repeat(900)] as unknown as string[],
    };
    const text = buildThesisText(
      doc(loadStock("AAPL"), "en", { thesis: junk }),
    );
    expect(text).toContain("- ok");
    expect(text).not.toContain("- 5");
    expect(text).not.toContain("x".repeat(EXPORT_ITEM_MAX + 1));
  });
  it("model output stays text: tags and markdown are not interpreted", () => {
    const bad = {
      ...THESIS,
      bullCase: ["<img src=x onerror=alert(1)> **bold**"],
    };
    const d = doc(loadStock("AAPL"), "en", { thesis: bad });
    expect(buildThesisText(d)).toContain(
      "<img src=x onerror=alert(1)> **bold**",
    );
    const html = render(<PrintSheet doc={d} />);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("print sheet and actions", () => {
  it("the print sheet is hidden on screen and shown in print, and escapes notes", () => {
    const d = doc(loadStock("AAPL"), "en", {
      entry: { ...ENTRY, note: "<script>x</script>" },
      thesis: THESIS,
    });
    const html = render(<PrintSheet doc={d} />);
    expect(html).toContain("hidden");
    expect(html).toContain("print:block");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("whitespace-pre-wrap");
    const t = unescape(visibleText(html));
    expect(t).toContain("Apple Inc.");
    expect(t).toContain("Your pick");
    expect(t).toContain("Educational content, not financial advice.");
    expect(t).not.toMatch(BROKEN);
  });
  it.each(["en", "fr"] as const)(
    "ExportActions shows both buttons and the print sheet (%s)",
    (locale) => {
      const html = render(
        <ExportActions stock={loadStock("AAPL")} thesis={null} />,
        locale,
      );
      const m = (locale === "en" ? en : fr).Export;
      const t = unescape(visibleText(html));
      expect(t).toContain(m.print);
      expect(t).toContain(m.copy);
      expect(html.match(/<button/g)).toHaveLength(2);
      // The controls do not print; the sheet does.
      expect(html).toContain("print:hidden");
      expect(html).toContain("print:block");
      expect(t).not.toMatch(BROKEN);
    },
  );
  it("works for a fund and with no AI", () => {
    const html = render(
      <ExportActions stock={loadStock("SPY")} thesis={null} />,
    );
    expect(visibleText(html)).toContain("No key numbers are available");
  });
});

describe("Export wording", () => {
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
    expect(keys(fr.Export).sort()).toEqual(keys(en.Export).sort());
  });
  it("has no empty, broken or advice-like strings", () => {
    for (const [lang, m] of [
      ["en", en],
      ["fr", fr],
    ] as const)
      for (const s of leaves(m.Export)) {
        expect(s.trim(), lang).not.toBe("");
        expect(s, lang).not.toMatch(BROKEN);
        expect(s, lang).not.toMatch(ADVICE);
      }
  });
  it("the disclaimer is on the summary in both languages", () => {
    expect(en.Export.disclaimer).toContain("not financial advice");
    expect(fr.Export.disclaimer).toContain("pas un conseil financier");
  });
});
