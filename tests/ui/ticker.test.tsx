import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TickerBandView } from "@/components/ticker/ticker-band";
import {
  copiesNeeded,
  formatKind,
  loopDuration,
  stableDuration,
  TICKER_MAX_COPIES,
  TICKER_SPEED_PX_S,
  tickerRows,
} from "@/components/ticker/ticker-format";
import type { TickerItem, TickerResponse } from "@/lib/contract";
import type { PolledResource } from "@/lib/data/hooks";
import { isReadyItem, TICKER_MIN_ITEMS, tickerItems } from "@/lib/data/ticker";
import {
  BROKEN,
  loadTicker,
  loading,
  ready,
  render,
  visibleText,
} from "./helpers";

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#x27;/g, "'");
const byId = (r: TickerResponse, id: string) =>
  r.items.find((i) => i.id === id) as TickerItem;
const view = (r: PolledResource<TickerResponse>) => (
  <TickerBandView ticker={r} />
);
const withItems = (items: TickerItem[]): TickerResponse => ({
  ...loadTicker(),
  items,
});
const unavailable = (item: TickerItem): TickerItem => ({
  ...item,
  price: null,
  change: null,
  changePercent: null,
  status: "unavailable",
});

describe("item selection", () => {
  const fixture = loadTicker();
  it("keeps the contract order and skips unavailable items (^BVSP in the fixture)", () => {
    const items = tickerItems(fixture);
    expect(fixture.items).toHaveLength(25);
    expect(items).toHaveLength(24);
    expect(items.map((i) => i.id)).not.toContain("bovespa");
    expect(items[0].id).toBe("sp500");
    expect(items.at(-1)?.id).toBe("us10y");
  });
  it("skips an `ok` item whose price is missing or not finite", () => {
    const bad = { ...byId(fixture, "dax"), price: Number.NaN };
    expect(isReadyItem(bad)).toBe(false);
    expect(isReadyItem({ ...bad, price: null })).toBe(false);
  });
  it("hides the band below the minimum, shows it at the minimum", () => {
    expect(TICKER_MIN_ITEMS).toBeGreaterThanOrEqual(4);
    const few = fixture.items.slice(0, TICKER_MIN_ITEMS - 1);
    expect(tickerItems(withItems(few))).toEqual([]);
    const enough = fixture.items.slice(0, TICKER_MIN_ITEMS);
    expect(tickerItems(withItems(enough))).toHaveLength(TICKER_MIN_ITEMS);
    // unavailable ones do not count towards the minimum
    const padded = [
      ...fixture.items.slice(0, TICKER_MIN_ITEMS - 1),
      unavailable(fixture.items[5]),
    ];
    expect(tickerItems(withItems(padded))).toEqual([]);
  });
  it("tolerates no data", () => {
    expect(tickerItems(null)).toEqual([]);
    expect(tickerItems(undefined)).toEqual([]);
  });
});

describe("formatting", () => {
  const fixture = loadTicker();
  const rowOf = (id: string, locale = "en") =>
    tickerRows(
      tickerItems(fixture).filter((i) => i.id === id),
      locale,
    )[0];

  it("index: level with 2 decimals, no unit, percent change with a direction", () => {
    const r = rowOf("sp500");
    expect(r.level).toBe("7,353.73");
    expect(r.unit).toBeNull();
    expect(r.change).toMatchObject({ direction: "down", points: false });
    expect(r.change?.text).toContain("4.36");
  });
  it("French uses its own separators", () => {
    expect(rowOf("sp500", "fr").level).toMatch(/^7\s353,73$/);
  });
  it("FX has 4 decimals and no currency", () => {
    const r = rowOf("eurusd");
    expect(r.level).toBe("1.1221");
    expect(r.unit).toBeNull();
  });
  it("VIX is formatted like an index (points, percent change)", () => {
    expect(formatKind("volatility")).toBe("index");
    const r = rowOf("vix");
    expect(r.level).toBe("28.18");
    expect(r.unit).toBeNull();
    expect(r.change).toMatchObject({ direction: "up", points: false });
  });
  it("yield: level in %, change in percentage points (never percent)", () => {
    const r = rowOf("us10y");
    expect(r.level).toBe("4.84");
    expect(r.unit).toBe("%");
    expect(r.change).toMatchObject({ direction: "down", points: true });
    expect(r.change?.text).toBe("-0.06");
  });
  it("gold is priced in USD", () => {
    const r = rowOf("gold");
    expect(r.unit).toBe("USD");
    expect(r.level).toBe("4,097.40");
  });
  it("flat when the change is exactly zero; no change figure when it is unknown", () => {
    const item = { ...byId(fixture, "dax"), change: 0, changePercent: 0 };
    const flat = tickerRows([item as never], "en")[0];
    expect(flat.change?.direction).toBe("flat");
    const none = tickerRows(
      [{ ...item, change: null, changePercent: null } as never],
      "en",
    )[0];
    expect(none.change).toBeNull();
  });
  it("marks the first item of every region (separator), including the list start", () => {
    const rows = tickerRows(tickerItems(fixture), "en");
    const starts = rows.filter((r) => r.regionStart).map((r) => r.region);
    expect(starts).toEqual(["americas", "europe", "asia_pacific", "other"]);
  });
  it("flags stale items", () => {
    const rows = tickerRows(tickerItems(fixture), "en");
    expect(rows.filter((r) => r.stale).map((r) => r.id)).toEqual(["hangseng"]);
  });
});

describe("loop maths", () => {
  it("duration keeps the speed constant per width", () => {
    expect(loopDuration(4400)).toBeCloseTo(4400 / TICKER_SPEED_PX_S, 1);
    expect(loopDuration(8800) / loopDuration(4400)).toBeCloseTo(2, 1);
    expect(TICKER_SPEED_PX_S).toBeGreaterThanOrEqual(40);
    expect(TICKER_SPEED_PX_S).toBeLessThanOrEqual(50);
  });
  it("always at least two copies (seamless), more for a wide window, capped", () => {
    expect(copiesNeeded(390, 3000)).toBe(2);
    expect(copiesNeeded(1280, 3000)).toBe(2);
    expect(copiesNeeded(2560, 600)).toBe(6);
    expect(copiesNeeded(10_000, 100)).toBe(TICKER_MAX_COPIES);
    expect(copiesNeeded(0, 0)).toBe(2);
    expect(copiesNeeded(1280, Number.NaN)).toBe(2);
  });
  it("a refresh that changes a few digits does not change the duration (no jump)", () => {
    expect(stableDuration(null, 90)).toBe(90);
    expect(stableDuration(90, 91.5)).toBe(90);
    expect(stableDuration(90, 120)).toBe(120);
  });
});

describe.each(["en", "fr"] as const)("band rendering (%s)", (locale) => {
  const fixture = loadTicker();
  const html = render(view(ready(fixture)), locale);

  it("renders nothing while loading, on error and with too few items", () => {
    expect(render(view(loading()), locale)).toBe("");
    expect(
      render(
        view({
          status: "error",
          error: { code: "upstream_unavailable" } as never,
        }),
        locale,
      ),
    ).toBe("");
    expect(
      render(view(ready(withItems(fixture.items.slice(0, 3)))), locale),
    ).toBe("");
  });
  it("is a labelled region; the list is duplicated and the copy is aria-hidden", () => {
    expect(html).toContain("<section");
    expect(html).toMatch(/aria-label="[^"]+"/);
    expect(html).not.toContain('role="marquee"');
    expect(html.match(/<ul/g)).toHaveLength(2);
    expect(html.match(/<ul[^>]*aria-hidden="true"/g)).toHaveLength(1);
    // the first (read) list carries the items once
    const first = html.slice(html.indexOf("<ul"), html.indexOf("</ul>"));
    expect(first.match(/<li/g)).toHaveLength(24);
  });
  it("never shows a broken value, and skipped items leave no trace", () => {
    const t = visibleText(html);
    expect(t).not.toMatch(BROKEN);
    expect(t).not.toMatch(/Bovespa/);
    expect(t).not.toMatch(/(?:^|\s)[-–—](?:\s|$)/); // no dash placeholders
  });
  it("every change has an arrow (svg) and a spoken direction, not colour alone", () => {
    const first = html.slice(html.indexOf("<ul"), html.indexOf("</ul>"));
    const lis = first.split("<li").slice(1);
    for (const li of lis) {
      expect(li).toMatch(/<svg/);
      expect(li).toMatch(/sr-only/);
    }
  });
  it("is keyboard-focusable (pause on focus; scrollable strip under reduced motion)", () => {
    expect(html).toContain('tabindex="0"');
  });
  it("translates gold and the yield, keeps the contract label otherwise", () => {
    const t = decode(visibleText(html));
    if (locale === "en") {
      expect(t).toContain("Gold (future)");
      expect(t).toContain("US 10Y yield");
    } else {
      expect(t).toContain("Or (terme)");
      expect(t).toContain("Taux US 10 ans");
    }
    expect(t).toContain("S&P 500");
  });
  it("yield uses the points unit; gold shows USD; indices show no currency", () => {
    const t = decode(visibleText(html));
    expect(t).toMatch(locale === "en" ? /pp/ : /pt/);
    expect(t).toMatch(/4[\s.,  ]097[.,]40 USD/);
    expect(t).not.toMatch(/[$€£¥]/);
  });
  it("marks the stale item quietly, with a spoken explanation", () => {
    const stale = html
      .split("<li")
      .filter((li) => li.includes("Hang Seng"))
      .slice(0, 1)[0];
    expect(stale).toContain("lucide-clock");
    expect(stale).toMatch(
      locale === "en" ? /Last saved value/ : /Dernière valeur enregistrée/,
    );
    const fresh = html.split("<li").find((li) => li.includes("DAX")) as string;
    expect(fresh).not.toContain("lucide-clock");
  });
  it("has the note about delayed quotes for assistive tech", () => {
    expect(html).toMatch(/class="sr-only">[^<]*(delayed|différés)/);
  });
});

describe("reduced motion", () => {
  const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8");
  it("animates only when motion is allowed, and has a static scrollable strip otherwise", () => {
    const anim = css.indexOf("animation: ticker-scroll");
    const noPref = css.lastIndexOf(
      "prefers-reduced-motion: no-preference",
      anim,
    );
    expect(noPref).toBeGreaterThan(css.indexOf(".ticker-item"));
    const reduce = css.slice(css.lastIndexOf("prefers-reduced-motion: reduce"));
    expect(reduce).toContain("overflow-x: auto");
    expect(reduce).toContain('.ticker-list[aria-hidden="true"]');
    expect(reduce).not.toContain("animation: ticker-scroll");
  });
  it("pauses on hover, keyboard focus, press and a hidden tab", () => {
    for (const s of [
      ".ticker:hover .ticker-track",
      ".ticker:focus-visible .ticker-track",
      ".ticker[data-pressed] .ticker-track",
      ".ticker[data-hidden] .ticker-track",
    ])
      expect(css).toContain(s);
    expect(css).toContain("animation-play-state: paused");
  });
});
