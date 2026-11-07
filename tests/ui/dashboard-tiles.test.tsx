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

import { EarningsView } from "@/components/dashboard/earnings-tile";
import { MarketsView } from "@/components/dashboard/markets-tile";
import { RecentView } from "@/components/dashboard/recent-tile";
import { StartHereView } from "@/components/dashboard/start-here-tile";
import {
  AssignmentTile,
  AssignmentView,
  LearnTile,
} from "@/components/dashboard/static-tiles";
import { Tile } from "@/components/dashboard/tile";
import { WatchlistView } from "@/components/dashboard/watchlist-tile";
import type { DataError } from "@/lib/data/errors";
import type { PolledResource } from "@/lib/data/hooks";
import type { MarketResponse, QuotesResponse } from "@/lib/contract";
import { termOfTheDay } from "@/lib/education/glossary";
import { START_HERE } from "@/lib/education/start-here";
import {
  BROKEN,
  loadMarket,
  loadQuotes,
  loading,
  ready,
  render,
  visibleText,
} from "./helpers";

const noop = () => {};
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#x27;/g, "'");
const text = (el: React.ReactElement, locale: "en" | "fr" = "en") =>
  decode(visibleText(render(el, locale)));
const failed = <T,>(): PolledResource<T> => ({
  status: "error",
  error: { code: "upstream_unavailable" } as DataError,
});
const co = (symbol: string, name = symbol) => ({ symbol, name, exchange: "X" });

describe.each(["en", "fr"] as const)("markets tile (%s)", (locale) => {
  it("loading: skeleton with an accessible label, no numbers", () => {
    const html = render(
      <MarketsView market={loading()} retry={noop} />,
      locale,
    );
    expect(html).toContain('role="status"');
    expect(visibleText(html)).not.toMatch(/\d/);
  });
  it("ok: 3 chips, 8 items, arrows and sr-only direction words", () => {
    const html = render(
      <MarketsView market={ready(loadMarket())} retry={noop} />,
      locale,
    );
    expect(html.match(/<li/g)!.length).toBe(11);
    expect(visibleText(html)).not.toMatch(BROKEN);
    expect(html).toContain("sr-only");
    expect(html).toContain("<svg");
  });
  it("error: calm message with a retry, no crash", () => {
    const t = text(<MarketsView market={failed()} retry={noop} />, locale);
    expect(t).not.toMatch(BROKEN);
    expect(t.length).toBeGreaterThan(20);
  });
  it("degraded: only the failing item is replaced; stale is labelled", () => {
    const m: MarketResponse = loadMarket("market-degraded");
    const t = text(<MarketsView market={ready(m)} retry={noop} />, locale);
    expect(t).not.toMatch(BROKEN);
    expect(t).toContain(
      locale === "en" ? "Not available right now" : "Indisponible",
    );
    expect(t).toContain(
      locale === "en" ? "Last saved price" : "Dernier cours enregistré",
    );
    expect(t).toContain("Nikkei 225"); // the other items still render
  });
  it("open market is shown as open", () => {
    const t = text(
      <MarketsView market={ready(loadMarket("market-open"))} retry={noop} />,
      locale,
    );
    expect(t).toContain(locale === "en" ? "Open" : "Ouvert");
  });
});

describe("markets special cases (EN)", () => {
  const t = text(<MarketsView market={ready(loadMarket())} retry={noop} />);
  it("yield change is in percentage points, level is a percent", () => {
    expect(t).toMatch(/US 10-year yield 4\.84 %/);
    expect(t).toContain("-0.06 pp");
  });
  it("gold is labelled as a future, in USD", () => {
    expect(t).toContain("Future");
    expect(t).toMatch(/Gold Future/);
    expect(t).toContain("USD");
  });
  it("indices and FX carry no currency", () => {
    expect(t).toMatch(/S&P 500 7,353\.73 Down/);
    expect(t).toMatch(/EUR\/USD 1\.1221 Down/);
  });
  it("delay is shown per item", () => {
    expect(t).toContain("Delayed 15 min");
    expect(t).toContain("Real time");
  });
  it("schedule-based status admits it ignores holidays", () => {
    const m = loadMarket();
    m.status[0].basis = "schedule";
    expect(text(<MarketsView market={ready(m)} retry={noop} />)).toContain(
      "holidays are not taken into account",
    );
  });
});

describe.each(["en", "fr"] as const)("watchlist tile (%s)", (locale) => {
  const quotes = ready(loadQuotes());
  it("empty: the invitation to star a company", () => {
    const t = text(
      <WatchlistView items={[]} quotes={quotes} retry={noop} />,
      locale,
    );
    expect(t).toContain(
      locale === "en"
        ? "Star a company to follow it here"
        : "Mettez une entreprise en favori",
    );
  });
  it("loading: names are shown at once, prices are skeletons", () => {
    const html = render(
      <WatchlistView
        items={[co("AAPL", "Apple")]}
        quotes={loading()}
        retry={noop}
      />,
      locale,
    );
    expect(visibleText(html)).toContain("Apple");
    expect(html).toContain("animate-pulse");
  });
  it("ok + stale + unavailable + not found + invalid: each row degrades alone", () => {
    const items = [
      co("MC.PA", "LVMH"),
      co("AAPL", "Apple"), // stale
      co("NVDA", "Nvidia"), // unavailable
      co("ZZZNOTREAL123", "Ghost"), // not_found
    ];
    const t = text(
      <WatchlistView items={items} quotes={quotes} retry={noop} />,
      locale,
    );
    expect(t).not.toMatch(BROKEN);
    expect(t).toContain("418"); // LVMH priced
    expect(t).toContain(
      locale === "en" ? "Last saved price" : "Dernier cours enregistré",
    );
    expect(t).toContain(
      locale === "en" ? "Price not available" : "Cours indisponible",
    );
    expect(t).toContain(
      locale === "en" ? "Symbol not found" : "Symbole introuvable",
    );
  });
  it("whole batch failed: rows keep their names, one message with retry", () => {
    const t = text(
      <WatchlistView
        items={[co("AAPL", "Apple")]}
        quotes={failed()}
        retry={noop}
      />,
      locale,
    );
    expect(t).toContain("Apple");
    expect(t).toContain(locale === "en" ? "Try again" : "Réessayer");
  });
  it("earnings chip: today wording, never a future date for today", () => {
    const q = loadQuotes();
    const toy = q.entries.find((e) => e.symbol === "7203.T")!.quote.value!;
    const at = new Date(2026, 10, 5, 12, 0, 0); // same local day as the report
    toy.nextEarnings = {
      value: {
        date: new Date(2026, 10, 5, 7, 0, 0).toISOString(),
        isEstimate: false,
      },
      reason: null,
    };
    const t = text(
      <WatchlistView
        items={[co("7203.T", "Toyota")]}
        quotes={ready(q, at.getTime())}
        retry={noop}
      />,
      locale,
    );
    expect(t).toContain(
      locale === "en" ? "Reported today" : "A publié aujourd'hui",
    );
    expect(t).not.toMatch(/nov/i);
  });
});

describe("recently viewed + start here", () => {
  const quotes = ready(loadQuotes());
  it("recent: empty state", () =>
    expect(text(<RecentView items={[]} quotes={quotes} />)).toContain(
      "will show up here",
    ));
  it("recent: rows with prices", () =>
    expect(
      text(<RecentView items={[co("MC.PA", "LVMH")]} quotes={quotes} />),
    ).toContain("LVMH"));
  it.each(["en", "fr"] as const)(
    "start here (%s): every company has its why-line even while loading",
    (locale) => {
      const t = text(
        <StartHereView companies={START_HERE} quotes={loading()} />,
        locale,
      );
      for (const c of START_HERE) {
        expect(t).toContain(c.name);
        expect(t).toContain(c.why[locale].slice(0, 20));
      }
    },
  );
  it("start here: stale quotes are labelled, no NaN", () => {
    const t = text(<StartHereView companies={START_HERE} quotes={quotes} />);
    expect(t).not.toMatch(BROKEN);
    expect(t).toContain("Last saved price");
  });
});

describe("earnings tile", () => {
  const now = new Date(2026, 10, 5, 12, 0, 0);
  const withDates = () => {
    const q = loadQuotes();
    const set = (s: string, d: Date | null) => {
      const v = q.entries.find((e) => e.symbol === s)!.quote.value!;
      v.nextEarnings = d
        ? { value: { date: d.toISOString(), isEstimate: false }, reason: null }
        : { value: null, reason: "not_provided_by_source" };
    };
    return { q, set };
  };
  const companies = [
    co("AAPL", "Apple"),
    co("MC.PA", "LVMH"),
    co("7203.T", "Toyota"),
  ];

  it("this week: listed soonest first; null dates dropped", () => {
    const { q, set } = withDates();
    set("AAPL", new Date(2026, 10, 9, 22, 0, 0));
    set("MC.PA", null);
    set("7203.T", new Date(2026, 10, 5, 7, 0, 0));
    const t = text(
      <EarningsView
        companies={companies}
        quotes={ready(q, now.getTime())}
        retry={noop}
      />,
    );
    expect(t.indexOf("Toyota")).toBeLessThan(t.indexOf("Apple"));
    expect(t).not.toContain("LVMH");
    expect(t).toContain("Reported today");
    expect(t).toContain("Reports Mon, Nov 9");
  });
  it("nothing this week: shows the next dates rather than an empty tile", () => {
    const { q, set } = withDates();
    set("AAPL", new Date(2027, 0, 28, 22, 0, 0));
    set("MC.PA", null);
    set("7203.T", null);
    const t = text(
      <EarningsView
        companies={companies}
        quotes={ready(q, now.getTime())}
        retry={noop}
      />,
    );
    expect(t).toContain("No reports expected this week");
    expect(t).toContain("Apple");
  });
  it("no dates at all: calm message", () => {
    const { q, set } = withDates();
    for (const s of ["AAPL", "MC.PA", "7203.T"]) set(s, null);
    expect(
      text(
        <EarningsView
          companies={companies}
          quotes={ready(q, now.getTime())}
          retry={noop}
        />,
      ),
    ).toContain("No report date is known yet");
  });
  it("loading and error states", () => {
    expect(
      render(
        <EarningsView companies={companies} quotes={loading()} retry={noop} />,
      ),
    ).toContain('role="status"');
    expect(
      text(
        <EarningsView companies={companies} quotes={failed()} retry={noop} />,
      ),
    ).toContain("Try again");
  });
  it("links to the EPS explainer", () =>
    expect(
      text(
        <EarningsView
          companies={companies}
          quotes={ready(loadQuotes(), now.getTime())}
          retry={noop}
        />,
      ),
    ).toContain("Explain"));
});

describe("static tiles + tile boundary", () => {
  it.each(["en", "fr"] as const)(
    "the assignment tile has a calm empty state with a way to make a link (%s)",
    (locale) => {
      const html = render(<AssignmentTile />, locale);
      const t = decode(visibleText(html));
      expect(t).toContain(
        locale === "en" ? "When your teacher shares" : "Quand votre professeur",
      );
      expect(html).toContain('href="/class"');
      expect(t).not.toMatch(BROKEN);
      expect(t).not.toContain(locale === "en" ? "Coming soon" : "Bientôt");
    },
  );
  it.each(["en", "fr"] as const)(
    "the assignment tile links back to the last class link, hide-AI intact (%s)",
    (locale) => {
      const link = {
        tickers: ["KO", "MC.PA"],
        hideAi: true,
        title: "Week <b>3</b>",
      };
      const html = render(<AssignmentView link={link} />, locale);
      expect(html).toContain(
        'href="/class?tickers=KO,MC.PA&amp;hideAI=1&amp;title=Week%20%3Cb%3E3%3C%2Fb%3E"',
      );
      // The title is text, never markup.
      expect(html).not.toContain("<b>");
      expect(html).toContain("Week &lt;b&gt;3&lt;/b&gt;");
      const t = decode(visibleText(html));
      expect(t).toContain("KO · MC.PA");
      expect(t).toContain(locale === "en" ? "AI hidden" : "IA masquée");
      expect(t).not.toMatch(BROKEN);
    },
  );
  it.each(["en", "fr"] as const)(
    "the learn tile shows the term of the day and links to the glossary (%s)",
    (locale) => {
      const day = new Date("2026-11-07T12:00:00Z");
      const html = render(<LearnTile date={day} />, locale);
      const term = termOfTheDay(day);
      expect(html).toContain(`href="/learn#${term.id}"`);
      expect(html).toContain(`href="/learn"`);
      expect(text(<LearnTile date={day} />, locale)).toContain(
        term[locale].name,
      );
      expect(text(<LearnTile date={day} />, locale)).not.toMatch(BROKEN);
      expect(text(<LearnTile date={day} />, locale)).not.toContain(
        locale === "en" ? "Coming soon" : "Bientôt",
      );
    },
  );
  it("tile frame has a labelled heading", () => {
    const html = render(
      <Tile id="x" title="Hello" hint="Hint">
        <p>body</p>
      </Tile>,
    );
    expect(html).toContain('aria-labelledby="x-title"');
    expect(html).toContain('id="x-title"');
  });
});

describe("QuotesResponse fixture is the shape the tiles expect", () => {
  it("has ok, stale, unavailable, not_found and invalid entries", () => {
    const q: QuotesResponse = loadQuotes();
    expect(new Set(q.entries.map((e) => e.status))).toEqual(
      new Set(["ok", "unavailable", "not_found", "invalid"]),
    );
  });
});
