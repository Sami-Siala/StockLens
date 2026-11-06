import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readHideAi, thesisPlan } from "@/components/stock/ai-flag";
import { ThesisColumns, ThesisIntro } from "@/components/stock/thesis";
import {
  GLOSSARY_IDS,
  retryHint,
  textList,
} from "@/components/stock/thesis-logic";
import type { ThesisResponse } from "@/lib/contract";
import { thesisFixture, type ThesisVariant } from "@/lib/data/ai-fixtures";
import { DataError } from "@/lib/data/errors";
import type { Resource } from "@/lib/data/hooks";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { BROKEN, render, visibleText as stripTags } from "./helpers";

/** What a reader sees: tags removed and HTML entities decoded. */
const visibleText = (html: string) =>
  stripTags(html)
    .replace(/[\u00a0\u202f]/g, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

const ready = (r: ThesisResponse): Resource<ThesisResponse> => ({
  status: "ready",
  data: r,
});
const fixture = (variant: ThesisVariant, lang: "en" | "fr" = "en") =>
  ready(thesisFixture("AAPL", lang, variant));
const noop = () => {};
const page = (state: Resource<ThesisResponse>, lang: "en" | "fr" = "en") =>
  render(
    <>
      <ThesisIntro state={state} onRetry={noop} />
      <ThesisColumns state={state} />
    </>,
    lang,
  );

describe.each(["en", "fr"] as const)("thesis, ready (%s)", (lang) => {
  const html = page(fixture("ready", lang), lang);
  const text = visibleText(html);
  const m = (lang === "fr" ? fr : en).Stock.thesis;

  it("shows the explainer, the three columns, risks, watch-list and the notice", () => {
    for (const s of [
      m.introTitle,
      m.whatItDoes,
      m.howItMakesMoney,
      m.for.title,
      m.against.title,
      m.wait.title,
      m.risks,
      m.watch,
      m.notAdvice,
    ])
      expect(text).toContain(s);
    const t = thesisFixture("AAPL", lang, "ready").result;
    if (t.status !== "ready") throw new Error("fixture");
    for (const arg of [
      ...t.thesis.bullCase,
      ...t.thesis.bearCase,
      ...t.thesis.holdCase,
    ])
      expect(text).toContain(arg.replace(/[\u00a0\u202f]/g, " "));
  });
  it("has no NaN / undefined / null", () => expect(text).not.toMatch(BROKEN));
  it("shows the glossary terms as plain chips (no links or buttons)", () => {
    expect(text).toContain(m.termsLabels.pe);
    expect(text).toContain(m.termsLabels.payout_ratio);
    expect(html).not.toMatch(/<a |<button/);
  });
  it("never reads as advice (columns are 'arguments', no imperative)", () => {
    expect(text).not.toMatch(
      /\bbuy now\b|\bachetez\b|\bvendez\b|\bsell now\b/i,
    );
  });
  it("has no stale badge on a fresh generation", () =>
    expect(text).not.toContain(m.stale));
});

describe("thesis, stale", () => {
  it.each(["en", "fr"] as const)(
    "shows the earlier-generation badge (%s)",
    (lang) => {
      const m = (lang === "fr" ? fr : en).Stock.thesis;
      const text = visibleText(page(fixture("stale", lang), lang));
      expect(text).toContain(m.staleOn.split("{date}")[0]);
      expect(text).toMatch(/2026/);
      expect(text).toContain(m.for.title); // still fully readable
    },
  );
});

describe("thesis, plain text only", () => {
  const html = page(fixture("markup"));
  it("shows markup literally", () => {
    const text = visibleText(html)
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">");
    expect(text).toContain("**Bold stars**");
    expect(text).toContain("<b>bold tags</b>");
    expect(text).toContain("<script>alert(1)</script>");
    expect(text).toContain("[a link](javascript:alert(1))");
    expect(text).toContain("## not a heading");
  });
  it("emits no element built from model text", () => {
    expect(html).not.toMatch(/<b>|<script|<img |<h1|href="javascript/);
    expect(html).toContain("&lt;b&gt;bold tags&lt;/b&gt;");
  });
  it("does not use dangerouslySetInnerHTML anywhere in the thesis UI", () => {
    for (const f of ["thesis.tsx", "thesis-logic.ts", "stock-view.tsx"])
      expect(
        readFileSync(join(__dirname, "../../components/stock", f), "utf8"),
      ).not.toContain("dangerouslySetInnerHTML");
  });
  it("drops non-string list entries instead of crashing", () => {
    expect(textList(["a", 3, null, " ", { x: 1 }, "b"])).toEqual(["a", "b"]);
    expect(textList(undefined)).toEqual([]);
  });
});

describe.each(["en", "fr"] as const)("thesis, other states (%s)", (lang) => {
  const m = (lang === "fr" ? fr : en).Stock.thesis;
  const u = m.unavailable;

  it("loading: a calm line and a skeleton, no columns", () => {
    const html = page({ status: "loading" }, lang);
    const text = visibleText(html);
    expect(text).toContain(m.writing);
    expect(text).toContain(m.introTitle);
    expect(text).not.toContain(m.for.title);
    expect(html).toContain('role="status"');
  });

  /** The Try again control is a real button (the sentence "try again in a moment" is not). */
  const button = (html: string) =>
    /<button[^>]*>[^<]*(<svg.*?<\/svg>)?\s*[^<]*<\/button>/.test(html);
  const view = (state: Resource<ThesisResponse>) => {
    const html = page(state, lang);
    return { html, text: visibleText(html), retry: button(html) };
  };

  it("model_error: quiet card with Try again", () => {
    const { text, retry } = view(fixture("model_error", lang));
    expect(text).toContain(u.title);
    expect(text).toContain(u.model_error);
    expect(retry).toBe(true);
    expect(text).toContain(u.retry);
    expect(text).not.toContain(m.for.title);
  });

  it("no_key and insufficient_data: quiet card, no Try again", () => {
    for (const [v, body] of [
      ["no_key", u.no_key],
      ["insufficient_data", u.insufficient_data],
    ] as const) {
      const { text, retry } = view(fixture(v, lang));
      expect(text).toContain(u.title);
      expect(text).toContain(body);
      expect(retry).toBe(false);
    }
  });

  it("quota_exhausted: daily limit with the retry hint (3 h), no button", () => {
    const { text, retry } = view(fixture("quota_exhausted", lang));
    expect(text).toContain(u.quotaTitle);
    expect(text).toMatch(
      lang === "fr" ? /dans environ 3 heures/ : /in about 3 hours/,
    );
    expect(retry).toBe(false); // a daily limit is not worth a button
  });

  it("quota_exhausted with a short wait offers Try again", () => {
    const r = thesisFixture("AAPL", lang, "quota_exhausted");
    if (r.result.status !== "unavailable") throw new Error("fixture");
    r.result.retryAfter = 45;
    const { text, retry } = view(ready(r));
    expect(text).toMatch(
      lang === "fr" ? /dans environ 1 minute/ : /in about 1 minute/,
    );
    expect(retry).toBe(true);
  });

  it("quota_exhausted without a hint still reads well", () => {
    const r = thesisFixture("AAPL", lang, "quota_exhausted");
    if (r.result.status !== "unavailable") throw new Error("fixture");
    delete r.result.retryAfter;
    const { text } = view(ready(r));
    expect(text).toContain(u.quotaLater);
    expect(text).not.toMatch(BROKEN);
  });

  it("not_applicable_for_type: a short note about funds, no Try again", () => {
    const { text, retry } = view(fixture("not_applicable_for_type", lang));
    expect(text).toContain(u.notApplicableTitle);
    expect(text).toContain(u.notApplicable);
    expect(retry).toBe(false);
  });

  it("a transport error shows the same quiet card with Try again", () => {
    const { text, retry } = view({
      status: "error",
      error: new DataError("network"),
    });
    expect(text).toContain(u.title);
    expect(text).toContain(u.loadFailed);
    expect(retry).toBe(true);
  });

  it("every state is free of NaN / undefined / null", () => {
    for (const v of [
      "no_key",
      "quota_exhausted",
      "model_error",
      "not_applicable_for_type",
      "insufficient_data",
    ] as const)
      expect(visibleText(page(fixture(v, lang), lang))).not.toMatch(BROKEN);
  });
});

describe("a malformed thesis cannot break the page", () => {
  it("missing arrays render what is there", () => {
    const r = thesisFixture("AAPL", "en", "ready");
    if (r.result.status !== "ready") throw new Error("fixture");
    const t = r.result.thesis as unknown as Record<string, unknown>;
    t.bearCase = undefined;
    t.holdCase = "not a list";
    t.glossaryTerms = ["made_up_term", "pe"];
    const text = visibleText(page(ready(r)));
    expect(text).toContain("Arguments for");
    expect(text).not.toContain("Arguments against");
    expect(text).toContain("P/E ratio");
    expect(text).not.toContain("made_up_term");
    expect(text).not.toMatch(BROKEN);
  });
});

describe("teacher flag ?hideAI=1", () => {
  it("reads the query", () => {
    expect(readHideAi("?hideAI=1")).toBe(true);
    expect(readHideAi("?x=2&hideAI=true")).toBe(true);
    expect(readHideAi("")).toBe(false);
    expect(readHideAi("?hideAI=0")).toBe(false);
    expect(readHideAi("?hideai=1")).toBe(false);
  });
  it("hidden = no section and no fetch; unknown = neither; shown waits for the stock", () => {
    expect(thesisPlan(true, true)).toEqual({ render: false, fetch: false });
    expect(thesisPlan(true, null)).toEqual({ render: false, fetch: false });
    expect(thesisPlan(false, false)).toEqual({ render: true, fetch: false });
    expect(thesisPlan(true, false)).toEqual({ render: true, fetch: true });
  });
});

describe("retry hint", () => {
  it("picks minutes below 90 min, hours above", () => {
    expect(retryHint(45)).toEqual({ unit: "minutes", count: 1 });
    expect(retryHint(600)).toEqual({ unit: "minutes", count: 10 });
    expect(retryHint(3 * 3600)).toEqual({ unit: "hours", count: 3 });
    expect(retryHint(undefined)).toBeNull();
    expect(retryHint(0)).toBeNull();
    expect(retryHint(Number.NaN)).toBeNull();
  });
});

describe("messages", () => {
  it("label every glossary id the contract allows, in both languages", () => {
    for (const m of [en, fr])
      expect(Object.keys(m.Stock.thesis.termsLabels).sort()).toEqual(
        [...GLOSSARY_IDS].sort(),
      );
  });
});
