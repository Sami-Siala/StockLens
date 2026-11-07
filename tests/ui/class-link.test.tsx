import { describe, expect, it, vi } from "vitest";

// next-intl's navigation helpers need the Next runtime; a plain anchor is enough to test rendering.
vi.mock("@/components/navigation", () => ({
  Link: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: () => {} }),
  usePathname: () => "/",
}));

import { ClassBuilder } from "@/components/class/class-builder";
import {
  ClassEmpty,
  ClassHeader,
  ClassList,
} from "@/components/class/class-view";
import { readHideAi } from "@/components/stock/ai-flag";
import {
  createClassLinkStore,
  rememberClassLink,
} from "@/lib/data/local/class-link";
import type { StorageLike } from "@/lib/data/local/store";
import {
  CLASS_MAX_TICKERS,
  CLASS_TITLE_MAX,
  classHref,
  classQuery,
  classUrl,
  cleanTitle,
  normaliseClassLink,
  parseClassLink,
  stockHref,
} from "@/lib/education/class-link";
import {
  BROKEN,
  loadQuotes,
  loading,
  ready,
  render,
  visibleText,
} from "./helpers";

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');
const text = (el: React.ReactElement, locale: "en" | "fr" = "en") =>
  decode(visibleText(render(el, locale)));

const memory = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};
const throwing: StorageLike = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("quota");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("parseClassLink", () => {
  it("reads tickers, the hide-AI flag and the title", () => {
    const l = parseClassLink("?tickers=KO,NVDA,MC.PA&hideAI=1&title=Week%203");
    expect(l.tickers).toEqual(["KO", "NVDA", "MC.PA"]);
    expect(l.hideAi).toBe(true);
    expect(l.title).toBe("Week 3");
    expect(l.issues).toEqual({ invalid: [], overflow: 0 });
  });
  it("works with or without the leading ?, and is case-tolerant for symbols", () => {
    expect(parseClassLink("tickers=ko,mc.pa").tickers).toEqual(["KO", "MC.PA"]);
  });
  it("hide-AI is only on for 1 or true", () => {
    expect(parseClassLink("?tickers=KO&hideAI=true").hideAi).toBe(true);
    for (const v of ["0", "", "yes", "TRUE"])
      expect(parseClassLink(`?tickers=KO&hideAI=${v}`).hideAi).toBe(false);
    expect(parseClassLink("?tickers=KO").hideAi).toBe(false);
  });
  it("drops invalid symbols and reports them", () => {
    const l = parseClassLink(
      "?tickers=KO,%3Cscript%3E,NOT!OK,javascript:alert(1),AAPL,,",
    );
    expect(l.tickers).toEqual(["KO", "AAPL"]);
    expect(l.issues.invalid).toEqual(
      ["<script>", "NOT!OK", "javascript:alert(1)"].map((s) =>
        s.length > 14 ? `${s.slice(0, 13)}…` : s,
      ),
    );
  });
  it("accepts the symbols the app really uses", () => {
    const l = parseClassLink(
      `?tickers=${["^GSPC", "BRK-B", "7203.T", "EURUSD=X", "MC.PA"].map(encodeURIComponent).join(",")}`,
    );
    expect(l.tickers).toEqual([
      "^GSPC",
      "BRK-B",
      "7203.T",
      "EURUSD=X",
      "MC.PA",
    ]);
  });
  it("removes duplicates, keeping the first position", () => {
    expect(parseClassLink("?tickers=KO,NVDA,ko,KO,NVDA").tickers).toEqual([
      "KO",
      "NVDA",
    ]);
  });
  it("keeps at most 12 and counts the rest", () => {
    const many = Array.from({ length: 15 }, (_, i) => `S${i}`).join(",");
    const l = parseClassLink(`?tickers=${many}`);
    expect(l.tickers).toHaveLength(CLASS_MAX_TICKERS);
    expect(l.tickers[11]).toBe("S11");
    expect(l.issues.overflow).toBe(3);
  });
  it("copes with empty, missing and hostile input without throwing", () => {
    for (const s of [
      "",
      "?",
      "?tickers=",
      "?tickers=,,,",
      "?%E0%A4%A",
      "?tickers=%",
    ])
      expect(() => parseClassLink(s)).not.toThrow();
    expect(parseClassLink("").tickers).toEqual([]);
    expect(parseClassLink("?title=x").tickers).toEqual([]);
  });
  it("clips the title and strips control and direction-override characters", () => {
    const long = "a".repeat(200);
    expect(parseClassLink(`?title=${long}`).title).toHaveLength(
      CLASS_TITLE_MAX,
    );
    expect(cleanTitle("  a\n\tb\u0000c‮evil  ")).toBe("a b c evil");
    expect(cleanTitle("😀".repeat(100))).toBe("😀".repeat(CLASS_TITLE_MAX));
    expect(cleanTitle(undefined)).toBe("");
  });
  it("re-validates a link read back from storage", () => {
    expect(normaliseClassLink({ tickers: "KO" })).toBeNull();
    expect(normaliseClassLink({ tickers: ["<x>"] })).toBeNull();
    expect(normaliseClassLink(null)).toBeNull();
    expect(
      normaliseClassLink({
        tickers: ["ko", 3, "KO", "NVDA"],
        hideAi: "yes",
        title: "T",
      }),
    ).toEqual({ tickers: ["KO", "NVDA"], hideAi: false, title: "T" });
  });
});

describe("class link builder (URL round trip)", () => {
  it("builds the documented shape", () => {
    expect(
      classHref({ tickers: ["KO", "NVDA", "MC.PA"], hideAi: true, title: "" }),
    ).toBe("/class?tickers=KO,NVDA,MC.PA&hideAI=1");
    expect(classHref({ tickers: ["KO"], hideAi: false, title: "" })).toBe(
      "/class?tickers=KO",
    );
  });
  it("makes an absolute URL with the locale", () => {
    expect(
      classUrl(
        { tickers: ["KO"], hideAi: false, title: "" },
        "https://x.test",
        "fr",
      ),
    ).toBe("https://x.test/fr/class?tickers=KO");
  });
  it.each([
    {
      tickers: ["KO", "NVDA", "MC.PA"],
      hideAi: true,
      title: "Semaine 3 : marques",
    },
    { tickers: ["^GSPC", "BRK-B", "EURUSD=X"], hideAi: false, title: "" },
    { tickers: ["AAPL"], hideAi: true, title: 'A & B = C? 100% <ok> "q" 😀' },
  ])("parse(build(x)) === x for %j", (link) => {
    const url = new URL(classUrl(link, "https://x.test", "en"));
    const back = parseClassLink(url.search);
    expect({
      tickers: back.tickers,
      hideAi: back.hideAi,
      title: back.title,
    }).toEqual(link);
  });
  it("never emits more than 12 tickers or an over-long title", () => {
    const tickers = Array.from({ length: 20 }, (_, i) => `S${i}`);
    const q = classQuery({ tickers, hideAi: false, title: "x".repeat(300) });
    const back = parseClassLink(`?${q}`);
    expect(back.tickers).toHaveLength(12);
    expect(back.title).toHaveLength(CLASS_TITLE_MAX);
  });
  it.each(["en", "fr"] as const)(
    "renders the builder with search, hide-AI, title and the link (%s)",
    (locale) => {
      const html = render(
        <ClassBuilder
          initial={{ tickers: ["KO", "NVDA"], hideAi: true, title: "Week 3" }}
          origin="https://stocklens.test"
        />,
        locale,
      );
      expect(html).toContain(
        `value="https://stocklens.test/${locale}/class?tickers=KO,NVDA&amp;hideAI=1&amp;title=Week%203"`,
      );
      expect(html).toContain('role="search"');
      expect(html).toContain('type="checkbox"');
      expect(html).toContain("checked");
      expect(html).toContain(`maxLength="${CLASS_TITLE_MAX}"`);
      expect(visibleText(html)).not.toMatch(BROKEN);
    },
  );
  it("asks for a first company instead of showing an empty link", () => {
    const html = render(<ClassBuilder origin="https://stocklens.test" />);
    expect(html).not.toContain("https://stocklens.test");
    expect(visibleText(html)).toContain("Pick at least one company");
  });
});

describe("class page rendering", () => {
  const parse = (s: string) => parseClassLink(s);

  it("shows one card per company with name and price, from the batched quotes", () => {
    const link = parse("?tickers=AAPL,MC.PA");
    const t = text(
      <ClassList link={link} quotes={ready(loadQuotes())} retry={() => {}} />,
    );
    expect(t).toContain("2 companies");
    expect(t).toContain("AAPL");
    expect(t).toContain("MC.PA");
    expect(t).toMatch(/Apple/i);
    expect(t).not.toMatch(BROKEN);
  });
  it("one failing company degrades alone", () => {
    const link = parse("?tickers=AAPL,NVDA,ZZZNOTREAL,NOPE");
    // The fixture's not-found entry has a symbol too long for a ticker; give it a valid one.
    const q = loadQuotes();
    for (const e of q.entries)
      if (e.symbol === "ZZZNOTREAL123") e.symbol = "ZZZNOTREAL";
    const html = render(
      <ClassList link={link} quotes={ready(q)} retry={() => {}} />,
    );
    const t = decode(visibleText(html));
    expect(t).toContain("Price not available"); // NVDA
    expect(t).toContain("Symbol not found"); // ZZZNOTREAL
    expect(t).toMatch(/Apple/i);
    expect(t).not.toMatch(BROKEN);
  });
  it("shows skeleton rows while loading, and a retry when the call failed", () => {
    const link = parse("?tickers=AAPL");
    expect(
      render(<ClassList link={link} quotes={loading()} retry={() => {}} />),
    ).toContain("animate-pulse");
    const err = text(
      <ClassList
        link={link}
        quotes={{ status: "error", error: { code: "provider_error" } as never }}
        retry={() => {}}
      />,
    );
    expect(err).toContain("Prices are not available right now");
    expect(err).toContain("Try again");
    expect(err).toContain("AAPL"); // the list itself is still there
  });
  it.each(["en", "fr"] as const)(
    "carries hideAI onto every stock link (%s)",
    (locale) => {
      const hidden = render(
        <ClassList
          link={parse("?tickers=AAPL,KO&hideAI=1")}
          quotes={ready(loadQuotes())}
          retry={() => {}}
        />,
        locale,
      );
      expect(hidden).toContain('href="/stock/AAPL?hideAI=1"');
      expect(hidden).toContain('href="/stock/KO?hideAI=1"');
      const shown = render(
        <ClassList
          link={parse("?tickers=AAPL")}
          quotes={ready(loadQuotes())}
          retry={() => {}}
        />,
        locale,
      );
      expect(shown).toContain('href="/stock/AAPL"');
      expect(shown).not.toContain("hideAI");
    },
  );
  it("the stock page reads exactly what the class page writes", () => {
    for (const sym of ["KO", "MC.PA", "^GSPC"]) {
      const href = stockHref(sym, true);
      expect(readHideAi(href.slice(href.indexOf("?")))).toBe(true);
      expect(href.includes("?")).toBe(true);
      expect(stockHref(sym, false).includes("?")).toBe(false);
    }
    expect(stockHref("^GSPC", false)).toBe("/stock/%5EGSPC");
  });
  it("a title that looks like markup is shown as text", () => {
    const link = parse(
      `?tickers=KO&title=${encodeURIComponent('<img src=x onerror="alert(1)"><script>alert(2)</script>')}`,
    );
    const html = render(<ClassHeader link={link} />);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;img src=x onerror=");
  });
  it.each(["en", "fr"] as const)(
    "invalid or empty input is a friendly empty state (%s)",
    (locale) => {
      for (const search of [
        "",
        "?tickers=",
        "?tickers=%3Cb%3E,%20",
        "?title=Hello",
      ]) {
        const link = parseClassLink(search);
        const t = text(<ClassEmpty link={link} />, locale);
        expect(t).toContain(
          locale === "en"
            ? "No companies in this link"
            : "Aucune entreprise dans ce lien",
        );
        expect(t).not.toMatch(BROKEN);
      }
      const invalid = text(
        <ClassEmpty link={parseClassLink("?tickers=%3Cb%3E")} />,
        locale,
      );
      expect(invalid).toContain(
        locale === "en" ? "valid ticker" : "symbole valide",
      );
    },
  );
  it("tells the teacher what was left out", () => {
    const many = Array.from({ length: 14 }, (_, i) => `S${i}`).join(",");
    const t = text(
      <ClassList
        link={parse(`?tickers=${many},bad!`)}
        quotes={ready(loadQuotes())}
        retry={() => {}}
      />,
    );
    expect(t).toContain("at most 12");
    expect(t).toContain("2 more were left out");
    expect(t).toContain("bad!");
  });
  it("explains the hidden AI to the student", () => {
    expect(
      text(<ClassHeader link={parse("?tickers=KO&hideAI=1")} />),
    ).toContain("hid the AI explanation");
    expect(text(<ClassHeader link={parse("?tickers=KO")} />)).not.toContain(
      "hid the AI",
    );
  });
});

describe("last class link (home tile 10)", () => {
  it("remembers a link and gives it back validated", () => {
    const s = memory();
    const store = createClassLinkStore(() => s);
    expect(
      rememberClassLink(
        { tickers: ["KO", "NVDA"], hideAi: true, title: "W3" },
        store,
      ),
    ).toBe(true);
    expect(store.read()).toEqual([
      { tickers: ["KO", "NVDA"], hideAi: true, title: "W3" },
    ]);
  });
  it("keeps only the latest, and does not rewrite an identical link", () => {
    const store = createClassLinkStore(() => memory());
    const spy = vi.fn();
    store.subscribe(spy);
    const a = { tickers: ["KO"], hideAi: false, title: "" };
    rememberClassLink(a, store);
    rememberClassLink({ ...a }, store);
    expect(spy).toHaveBeenCalledTimes(1);
    rememberClassLink({ tickers: ["AAPL"], hideAi: true, title: "" }, store);
    expect(store.read()).toHaveLength(1);
    expect(store.read()[0].tickers).toEqual(["AAPL"]);
  });
  it("refuses an empty list and ignores hostile stored data", () => {
    const s = memory();
    const store = createClassLinkStore(() => s);
    expect(
      rememberClassLink({ tickers: [], hideAi: false, title: "" }, store),
    ).toBe(false);
    s.data.set(
      "stocklens:class:v1",
      '[{"tickers":["<script>"]},{"tickers":"KO"},"x"]',
    );
    expect(store.read()).toEqual([]);
  });
  it("storage failing: no throw, memory fallback", () => {
    const store = createClassLinkStore(() => throwing);
    expect(() =>
      rememberClassLink({ tickers: ["KO"], hideAi: false, title: "" }, store),
    ).not.toThrow();
    expect(store.read()[0].tickers).toEqual(["KO"]);
  });
});
