import { describe, expect, it } from "vitest";
import { GlossaryList } from "@/components/learn/glossary-list";
import { SeanceTag } from "@/components/learn/seance-tag";
import type { GlossaryTermId } from "@/lib/contract";
import {
  CARD_TERM,
  GLOSSARY,
  GLOSSARY_ENTRY_IDS,
  getText,
  isGlossaryId,
  searchGlossary,
  sortedGlossary,
  termForCard,
  termOfTheDay,
  type GlossaryText,
} from "@/lib/education/glossary";
import { matchesQuery } from "@/lib/education/search";
import { glossaryView } from "@/lib/education/view";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { BROKEN, render, visibleText } from "./helpers";

/** Every id lib/contract/ai.ts allows a thesis to cite (the compiler checks this list is complete). */
const CONTRACT_IDS = [
  "eps",
  "pe",
  "forward_pe",
  "market_cap",
  "dividend_yield",
  "payout_ratio",
  "free_cash_flow",
  "operating_margin",
  "revenue_growth",
  "analyst_target",
  "beta",
  "margin_of_safety",
  "circle_of_competence",
] as const satisfies readonly GlossaryTermId[];
const _complete: Record<GlossaryTermId, true> = Object.fromEntries(
  CONTRACT_IDS.map((id) => [id, true]),
) as Record<(typeof CONTRACT_IDS)[number], true>;
void _complete;

const LOCALES = ["fr", "en"] as const;

/** Imperative buy/sell wording is never acceptable, in either language (PLAN §2, §5). */
const ADVICE =
  /\b(buy|sell|buying|selling|acheter|achetez|achète|vendez|vendre|invest now|investissez)\b|you should|vous devriez|il faut (acheter|vendre)/i;

const fields = (t: GlossaryText) =>
  [t.name, t.short, t.definition, t.formula, t.example, t.ruleOfThumb].filter(
    (v): v is string => v !== undefined,
  );

describe("glossary data", () => {
  it("covers every contract id and every key-card term", () => {
    for (const id of CONTRACT_IDS) expect(isGlossaryId(id)).toBe(true);
    for (const id of Object.values(CARD_TERM))
      expect(isGlossaryId(id)).toBe(true);
    expect(Object.keys(CARD_TERM).sort()).toEqual(
      ["eps", "fcf", "marketCap", "operating", "pe", "revenue"].sort(),
    );
  });
  it("has unique ids", () =>
    expect(new Set(GLOSSARY_ENTRY_IDS).size).toBe(GLOSSARY_ENTRY_IDS.length));

  describe.each(GLOSSARY.map((e) => [e.id, e] as const))("%s", (_id, entry) => {
    it.each(LOCALES)("has complete %s copy", (lang) => {
      const t = entry[lang];
      for (const key of ["name", "short", "definition", "example"] as const)
        expect(t[key].trim(), key).not.toBe("");
      // Optional fields are either absent or non-empty, and present in both languages or neither.
      for (const key of ["formula", "ruleOfThumb"] as const)
        if (t[key] !== undefined) expect(t[key]!.trim(), key).not.toBe("");
      expect(fields(t).join(" ")).not.toMatch(BROKEN);
    });
    it("has the same optional fields in French and English", () => {
      expect(entry.fr.formula === undefined).toBe(
        entry.en.formula === undefined,
      );
      expect(entry.fr.ruleOfThumb === undefined).toBe(
        entry.en.ruleOfThumb === undefined,
      );
    });
    it.each(LOCALES)("never reads as an instruction to trade (%s)", (lang) =>
      expect(fields(entry[lang]).join(" ")).not.toMatch(ADVICE),
    );
    it("has a valid session tag and valid, non-self links", () => {
      expect([1, 2, 3, 4, null]).toContain(entry.seance);
      for (const r of entry.related) {
        expect(isGlossaryId(r)).toBe(true);
        expect(r).not.toBe(entry.id);
      }
    });
    it.each(LOCALES)("has a one-line short text (%s)", (lang) => {
      const short = entry[lang].short;
      expect(short.length).toBeLessThanOrEqual(80);
      expect(short).not.toMatch(/\n/);
    });
  });

  it("does not tag as a lecture term what the lectures do not teach", () => {
    // Terms the lectures do define by name (checked against the local lecture PDFs).
    const taught = GLOSSARY.filter((e) => e.seance !== null).map((e) => e.id);
    for (const id of [
      "eps",
      "pe",
      "market_cap",
      "payout_ratio",
      "margin_of_safety",
    ])
      expect(taught).toContain(id);
    expect(GLOSSARY.find((e) => e.id === "beta")?.seance).toBeNull();
  });

  it("maps every key card to a term with the matching meaning", () => {
    for (const card of Object.keys(CARD_TERM))
      expect(termForCard(card)).not.toBeNull();
    expect(termForCard("nope")).toBeNull();
  });
});

describe("sorting and search", () => {
  it.each(LOCALES)("sorts A to Z by display name (%s)", (lang) => {
    const names = sortedGlossary(lang).map((e) => e[lang].name);
    const expected = [...names].sort((a, b) =>
      a.localeCompare(b, lang, { sensitivity: "base" }),
    );
    expect(names).toEqual(expected);
    expect(names).toHaveLength(GLOSSARY.length);
  });
  it("finds terms without caring about accents or case", () => {
    const ids = (q: string, l: string) =>
      searchGlossary(GLOSSARY, q, l).map((e) => e.id);
    expect(ids("benefice", "fr")).toContain("eps");
    expect(ids("BPA", "fr")).toContain("eps");
    expect(ids("payout", "en")).toContain("payout_ratio");
    expect(ids("capitalisation boursiere", "fr")).toContain("market_cap");
    expect(ids("   ", "en")).toHaveLength(GLOSSARY.length);
    expect(ids("zzzzqqq", "en")).toEqual([]);
  });
  it("matchesQuery needs every word", () => {
    expect(matchesQuery("Earnings per share", "per share")).toBe(true);
    expect(matchesQuery("Earnings per share", "per bond")).toBe(false);
  });
});

describe("term of the day", () => {
  it("is stable for the same calendar day, whatever the time", () => {
    const a = termOfTheDay(new Date("2026-11-07T00:10:00+01:00"));
    const b = termOfTheDay(new Date("2026-11-07T23:50:00+01:00"));
    expect(a.id).toBe(b.id);
    expect(termOfTheDay(new Date("2026-11-07T12:00:00Z")).id).toBe(a.id);
  });
  it("changes when the Paris day changes, not at UTC midnight", () => {
    const evening = termOfTheDay(new Date("2026-11-07T22:30:00Z")); // 23:30 in Paris
    const night = termOfTheDay(new Date("2026-11-07T23:30:00Z")); // 00:30 next day in Paris
    expect(evening.id).not.toBe(night.id);
    expect(night.id).toBe(termOfTheDay(new Date("2026-11-08T10:00:00Z")).id);
  });
  it("walks through every term before repeating", () => {
    const seen = new Set<string>();
    for (let d = 0; d < GLOSSARY.length; d++)
      seen.add(termOfTheDay(new Date(Date.UTC(2026, 0, 1 + d, 12))).id);
    expect(seen.size).toBe(GLOSSARY.length);
  });
  it("is deterministic across calls", () => {
    const day = new Date("2027-03-01T09:00:00Z");
    expect(termOfTheDay(day).id).toBe(termOfTheDay(new Date(day)).id);
  });
});

describe.each(LOCALES)("learn page list (%s)", (lang) => {
  const html = render(<GlossaryList terms={glossaryView(lang)} />, lang);
  const text = visibleText(html)
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"');
  const m = (lang === "fr" ? fr : en).Learn;

  it("renders every term with an anchor and its fields", () => {
    for (const e of GLOSSARY) {
      expect(html).toContain(`id="${e.id}"`);
      const t = e[lang];
      expect(text).toContain(t.name);
      expect(text).toContain(t.definition);
      expect(text).toContain(t.example);
      if (t.formula) expect(text).toContain(t.formula);
      if (t.ruleOfThumb) expect(text).toContain(t.ruleOfThumb);
    }
    expect(html).toContain('id="eps"');
    expect(html).toContain('id="pe"');
  });
  it("labels the rule of thumb as a guide, not a law", () => {
    expect(text).toContain(m.rule);
    expect(m.rule.toLowerCase()).toMatch(/pas une loi|not a law/);
  });
  it("has a labelled search box and a term count", () => {
    expect(html).toContain('type="search"');
    expect(text).toContain(m.searchLabel);
    expect(html).toContain(`placeholder="${m.searchPlaceholder}"`);
  });
  it("shows Séance tags only where the lectures teach the term", () => {
    const tagged = GLOSSARY.filter((e) => e.seance !== null).length;
    const label = m.seance.replace("{n}", "");
    expect(text.split(label).length - 1).toBe(tagged);
  });
  it("has no NaN / undefined / null and no advice wording", () => {
    expect(text).not.toMatch(BROKEN);
    expect(text).not.toMatch(ADVICE);
  });
});

describe("Séance tag", () => {
  it("renders the session number, or nothing", () => {
    expect(visibleText(render(<SeanceTag seance={3} />, "fr"))).toContain(
      "Séance 3",
    );
    expect(visibleText(render(<SeanceTag seance={3} />, "en"))).toContain(
      "Session 3",
    );
    expect(render(<SeanceTag seance={null} />, "en")).toBe("");
  });
});

describe("Learn messages", () => {
  it("exist in both languages with the same keys", () => {
    expect(Object.keys(fr.Learn).sort()).toEqual(Object.keys(en.Learn).sort());
    expect(Object.keys(fr.Nav)).toContain("learn");
    expect(fr.Stock.explain.readMore).toBeTruthy();
    expect(en.Stock.explain.readMore).toBeTruthy();
  });
  it("lookups by locale fall back to French for an unknown locale", () => {
    expect(getText("eps", "de").name).toBe(getText("eps", "fr").name);
  });
});
