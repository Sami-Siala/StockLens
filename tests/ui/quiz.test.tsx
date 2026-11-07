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

import { formatQuizParams, QuizCard } from "@/components/stock/quiz-card";
import { epsVerdict } from "@/components/stock/metrics";
import type { StockSnapshot } from "@/lib/contract";
import { isGlossaryId } from "@/lib/education/glossary";
import {
  buildQuiz,
  hashString,
  PAYOUT_HIGH,
  PAYOUT_LOW,
  QUIZ_RULE_IDS,
  quizDayKey,
  seededOrder,
  SIZE_LARGE,
  SIZE_MEGA,
  type QuizQuestion,
  type QuizRuleId,
} from "@/lib/education/quiz";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { BROKEN, loadStock, render, visibleText } from "./helpers";

const DAY = new Date("2026-11-07T12:00:00Z");
const quiz = (symbol: string, now = DAY) => buildQuiz(loadStock(symbol), now);
const rules = (symbol: string, now = DAY) =>
  quiz(symbol, now)
    .map((q) => q.rule)
    .sort();
const clone = (symbol: string): StockSnapshot =>
  structuredClone(loadStock(symbol));

/** Same advice detector as the glossary and "Your turn" tests (PLAN §2, §5). */
const ADVICE =
  /\b(buy|sell|buying|selling|acheter|achetez|achète|vendez|vendre|invest now|investissez)\b|you should|vous devriez|il faut (acheter|vendre)/i;

describe("which rules fire (existing fixtures)", () => {
  it("a full large-cap gets every rule except the loss-maker one", () => {
    expect(rules("AAPL")).toEqual(
      QUIZ_RULE_IDS.filter((r) => r !== "operating_loss").sort(),
    );
  });
  it("a loss-maker (RIVN): no P/E, dividend or payout rule, but a loss rule", () => {
    const r = rules("RIVN");
    for (const gone of [
      "pe_years",
      "pe_reading",
      "forward_vs_trailing",
      "dividend_income",
      "payout_ratio",
      "operating_margin",
    ] as QuizRuleId[])
      expect(r).not.toContain(gone);
    expect(r).toContain("operating_loss");
    expect(r).toContain("free_cash_flow");
    expect(quiz("RIVN").find((q) => q.rule === "free_cash_flow")?.explain).toBe(
      "negative",
    );
  });
  it("a currency mismatch (SHEL.L, P/E hidden) gets no P/E rule", () => {
    const r = rules("SHEL.L");
    expect(r).not.toContain("pe_years");
    expect(r).not.toContain("pe_reading");
    expect(r).not.toContain("forward_vs_trailing");
    // GBP price and GBP target are comparable, so that rule stays.
    expect(r).toContain("price_vs_target");
  });
  it("an ETF gets no quiz at all", () => {
    expect(quiz("SPY")).toEqual([]);
  });
  it("a share with no earnings block (MC.PA) skips only the EPS rule", () => {
    expect(rules("MC.PA")).not.toContain("eps_surprise");
    expect(rules("MC.PA")).toContain("pe_years");
  });
  it("market cap size is skipped when the currency is not comparable (Toyota, JPY)", () => {
    expect(rules("7203.T")).not.toContain("market_cap_size");
    expect(rules("TSM")).toContain("market_cap_size");
  });
});

describe("each rule: answers follow the data", () => {
  const find = (s: StockSnapshot, rule: QuizRuleId, now = DAY) =>
    buildQuiz(s, now).find((q) => q.rule === rule);
  const answerKey = (q: QuizQuestion) => q.options[q.answer].key;

  it("pe_years: the right option is the rounded P/E, with two distinct wrong ones", () => {
    const q = find(loadStock("AAPL"), "pe_years")!;
    expect(q.options).toHaveLength(3);
    const years = q.options.map((o) =>
      o.params?.n.kind === "number" ? o.params.n.n : NaN,
    );
    expect(years[q.answer]).toBe(Math.round(38.255024));
    expect(new Set(years).size).toBe(3);
  });
  it("pe_years: skipped for a P/E under 1.5 or non-finite", () => {
    const s = clone("AAPL");
    s.fundamentals.value!.keyStats.trailingPE = { value: 1, reason: null };
    expect(find(s, "pe_years")).toBeUndefined();
    s.fundamentals.value!.keyStats.trailingPE = { value: NaN, reason: null };
    expect(find(s, "pe_years")).toBeUndefined();
  });
  it("pe_reading: high P/E says growth, low says steady, the middle asks nothing", () => {
    const s = clone("AAPL");
    const setPe = (v: number) =>
      (s.fundamentals.value!.keyStats.trailingPE = { value: v, reason: null });
    setPe(34);
    expect(answerKey(find(s, "pe_reading")!)).toBe("growth");
    setPe(25);
    expect(find(s, "pe_reading")?.explain).toBe("growth");
    setPe(12);
    expect(find(s, "pe_reading")?.explain).toBe("steady");
    setPe(18);
    expect(find(s, "pe_reading")).toBeUndefined();
    expect(find(s, "pe_reading", DAY)).toBeUndefined();
    expect(
      buildQuiz(loadStock("7203.T"), DAY).find((q) => q.rule === "pe_reading")
        ?.explain,
    ).toBe("steady");
  });
  it("pe_reading is labelled as a rule of thumb", () => {
    expect(find(loadStock("AAPL"), "pe_reading")!.ruleOfThumb).toBe(true);
  });
  it("eps_surprise: beat, miss and in line match the card's own verdict", () => {
    const beat = find(loadStock("AAPL"), "eps_surprise")!;
    expect(beat.explain).toBe("beat");
    expect(answerKey(beat)).toBe("beat");
    expect(beat.ruleOfThumb).toBe(false);
    const miss = find(loadStock("JPM"), "eps_surprise")!;
    expect(miss.explain).toBe("miss");
    expect(answerKey(miss)).toBe("miss");
    const s = clone("AAPL");
    const e = s.earnings.value!.lastQuarter.value!;
    e.epsActual = 2;
    e.epsEstimate = 2;
    e.difference = 0;
    e.surprise = 0;
    expect(epsVerdict(0, 0)).toBe("inline");
    const inline = find(s, "eps_surprise")!;
    expect(answerKey(inline)).toBe("inline");
    expect(inline.ruleOfThumb).toBe(true);
    // Options keep the natural order (beat, in line, miss), never shuffled.
    expect(inline.options.map((o) => o.key)).toEqual([
      "beat",
      "inline",
      "miss",
    ]);
  });
  it("eps_surprise: a smaller loss than expected is still a beat; NaN is skipped", () => {
    expect(find(loadStock("RIVN"), "eps_surprise")?.explain).toBe("beat");
    const s = clone("AAPL");
    s.earnings.value!.lastQuarter.value!.epsActual = NaN;
    expect(find(s, "eps_surprise")).toBeUndefined();
  });
  it("forward_vs_trailing: lower forward P/E means higher expected profit, and the reverse", () => {
    expect(find(loadStock("AAPL"), "forward_vs_trailing")!.explain).toBe(
      "higher",
    );
    expect(find(loadStock("7203.T"), "forward_vs_trailing")!.explain).toBe(
      "lower",
    );
    const s = clone("AAPL");
    s.fundamentals.value!.keyStats.forwardPE = { value: 38.0, reason: null };
    // Within 3 percent: nothing worth asking.
    expect(find(s, "forward_vs_trailing")).toBeUndefined();
  });
  it("dividend_income: right amount is 1000 x yield, skipped for zero or absurd yields", () => {
    const q = find(loadStock("MC.PA"), "dividend_income")!;
    const money = q.options.map((o) =>
      o.params?.amount.kind === "money" ? o.params.amount.n : NaN,
    );
    expect(money[q.answer]).toBe(31);
    expect(q.params.stake).toMatchObject({ n: 1000, currency: "EUR" });
    expect(find(loadStock("RIVN"), "dividend_income")).toBeUndefined();
    const s = clone("MC.PA");
    s.fundamentals.value!.keyStats.dividendYield = { value: 3.1, reason: null };
    expect(find(s, "dividend_income")).toBeUndefined();
  });
  it("payout_ratio: low, mid and high buckets at the documented lines", () => {
    const s = clone("AAPL");
    const bucket = (p: number) => {
      s.fundamentals.value!.keyStats.payoutRatio = { value: p, reason: null };
      return find(s, "payout_ratio")?.explain;
    };
    expect(bucket(PAYOUT_LOW - 0.01)).toBe("low");
    expect(bucket(PAYOUT_LOW)).toBe("mid");
    expect(bucket(PAYOUT_HIGH)).toBe("mid");
    expect(bucket(PAYOUT_HIGH + 0.01)).toBe("high");
    expect(bucket(1.2)).toBe("high");
    expect(bucket(0)).toBeUndefined();
    expect(bucket(NaN)).toBeUndefined();
    expect(find(s, "payout_ratio")).toBeUndefined();
  });
  it("price_vs_target: above, below, about the same", () => {
    const s = clone("AAPL");
    const side = (mean: number) => {
      const t = s.analysts.value!.priceTarget.value!;
      t.low = Math.min(t.low, mean);
      t.high = Math.max(t.high, mean);
      t.mean = mean;
      return find(s, "price_vs_target")?.explain;
    };
    expect(side(400)).toBe("above");
    expect(side(300)).toBe("below");
    expect(side(343.53 * 1.01)).toBe("same");
    expect(find(s, "price_vs_target")!.ruleOfThumb).toBe(true);
  });
  it("price_vs_target: never compares across currencies", () => {
    const s = clone("AAPL");
    s.analysts.value!.priceTarget.value!.currency = "TWD";
    expect(find(s, "price_vs_target")).toBeUndefined();
    const s2 = clone("AAPL");
    s2.quote.value!.price.currency = "EUR";
    expect(find(s2, "price_vs_target")).toBeUndefined();
    // TSM's target is in USD like its price, even though the statements are in TWD.
    expect(find(loadStock("TSM"), "price_vs_target")).toBeDefined();
  });
  it("market_cap_size: small, large and mega at the documented lines", () => {
    const s = clone("AAPL");
    const size = (amount: number, currency = "USD") => {
      s.fundamentals.value!.keyStats.marketCap = {
        value: { amount, currency },
        reason: null,
      };
      return find(s, "market_cap_size")?.explain;
    };
    expect(size(SIZE_LARGE - 1)).toBe("small");
    expect(size(SIZE_LARGE)).toBe("large");
    expect(size(SIZE_MEGA - 1)).toBe("large");
    expect(size(SIZE_MEGA)).toBe("mega");
    expect(size(5e9, "JPY")).toBeUndefined();
    expect(size(-5)).toBeUndefined();
  });
  it("operating_margin and operating_loss are mutually exclusive", () => {
    const q = find(loadStock("AAPL"), "operating_margin")!;
    expect(q.options).toHaveLength(3);
    const n = q.options.map((o) =>
      o.params?.n.kind === "number" ? o.params.n.n : NaN,
    );
    expect(n[q.answer]).toBe(31);
    expect(new Set(n).size).toBe(3);
    expect(find(loadStock("AAPL"), "operating_loss")).toBeUndefined();
    expect(find(loadStock("RIVN"), "operating_margin")).toBeUndefined();
    const loss = find(loadStock("RIVN"), "operating_loss")!;
    expect(answerKey(loss)).toBe("costs");
  });
  it("free_cash_flow: sign decides, zero and missing are skipped", () => {
    const s = clone("AAPL");
    for (const p of [
      ...s.fundamentals.value!.quarterly,
      ...s.fundamentals.value!.annual,
    ])
      p.freeCashFlow = { value: null, reason: "not_reported" };
    expect(find(s, "free_cash_flow")).toBeUndefined();
    s.fundamentals.value!.quarterly.at(-1)!.freeCashFlow = {
      value: -5,
      reason: null,
    };
    s.fundamentals.value!.quarterly.at(-1)!.periodEnd = "2030-01-01";
    expect(find(s, "free_cash_flow")!.explain).toBe("negative");
    s.fundamentals.value!.quarterly.at(-1)!.freeCashFlow = {
      value: 0,
      reason: null,
    };
    expect(find(s, "free_cash_flow")).toBeUndefined();
  });
  it("money is shown in its own currency, never converted (TSM statements are TWD)", () => {
    const q = find(loadStock("TSM"), "free_cash_flow")!;
    expect(q.params.fcf).toMatchObject({ currency: "TWD" });
  });
});

describe("missing and hostile data never produce a question or an error", () => {
  it("every section unavailable -> no questions", () => {
    const s = clone("AAPL");
    s.fundamentals = { value: null, reason: "provider_error" };
    s.earnings = { value: null, reason: "provider_error" };
    s.analysts = { value: null, reason: "provider_error" };
    s.quote = { value: null, reason: "provider_error" };
    expect(buildQuiz(s, DAY)).toEqual([]);
  });
  it("NaN / Infinity everywhere -> no questions, no throw", () => {
    const s = clone("AAPL");
    const k = s.fundamentals.value!.keyStats;
    for (const key of [
      "trailingPE",
      "forwardPE",
      "dividendYield",
      "payoutRatio",
      "operatingMargin",
    ] as const)
      k[key] = { value: Infinity, reason: null };
    k.marketCap = { value: { amount: NaN, currency: "USD" }, reason: null };
    s.analysts.value!.priceTarget.value!.mean = NaN;
    const e = s.earnings.value!.lastQuarter.value!;
    e.surprise = NaN;
    for (const p of [
      ...s.fundamentals.value!.quarterly,
      ...s.fundamentals.value!.annual,
    ])
      p.freeCashFlow = { value: NaN, reason: null };
    expect(() => buildQuiz(s, DAY)).not.toThrow();
    // eps_surprise needs a finite surprise too.
    expect(buildQuiz(s, DAY)).toEqual([]);
  });
  it("a missing price currency or a non-equity type -> nothing", () => {
    const a = clone("AAPL");
    a.listing.priceCurrency = "";
    expect(buildQuiz(a, DAY)).toEqual([]);
    for (const type of [
      "ETF",
      "INDEX",
      "CRYPTOCURRENCY",
      "MUTUALFUND",
    ] as const) {
      const b = clone("AAPL");
      b.listing.quoteType = type;
      expect(buildQuiz(b, DAY)).toEqual([]);
    }
  });
  it("a company name with control characters or markup stays plain text", () => {
    const s = clone("AAPL");
    s.listing.shortName = "Evil\u0000\u001f <b>Corp</b>" + "x".repeat(200);
    const q = buildQuiz(s, DAY)[0];
    const name = q.params.name;
    expect(name.kind).toBe("text");
    if (name.kind === "text") {
      expect(name.s).not.toMatch(/[\u0000-\u001f]/);
      expect(name.s.length).toBeLessThanOrEqual(60);
    }
  });
});

describe("deterministic order", () => {
  it("the same symbol and day give exactly the same quiz", () => {
    expect(quiz("AAPL")).toEqual(quiz("AAPL", new Date(DAY)));
    // Any time within the same Paris day.
    expect(quiz("AAPL", new Date("2026-11-07T00:30:00+01:00"))).toEqual(
      quiz("AAPL", new Date("2026-11-07T23:30:00+01:00")),
    );
  });
  it("the order changes with the day and with the symbol", () => {
    const order = (sym: string, day: number) =>
      quiz(sym, new Date(Date.UTC(2026, 10, day, 12)))
        .map((q) => q.rule)
        .join(",");
    const days = new Set(
      Array.from({ length: 8 }, (_, i) => order("AAPL", 1 + i)),
    );
    expect(days.size).toBeGreaterThan(3);
    expect(order("AAPL", 7)).not.toBe(order("TSM", 7));
    // ...but it is always the same set of questions.
    expect(rules("AAPL", new Date("2026-11-01T12:00:00Z"))).toEqual(
      rules("AAPL"),
    );
  });
  it("the quiz day is the Paris calendar day", () => {
    expect(quizDayKey(new Date("2026-11-07T22:30:00Z"))).not.toBe(
      quizDayKey(new Date("2026-11-07T23:30:00Z")),
    );
  });
  it("seededOrder is a stable permutation; the hash is stable", () => {
    const o = seededOrder(10, "x");
    expect([...o].sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(seededOrder(10, "x")).toEqual(o);
    expect(hashString("AAPL|1")).toBe(hashString("AAPL|1"));
    expect(hashString("AAPL|1")).not.toBe(hashString("AAPL|2"));
  });
  it("the right answer is not always the first option", () => {
    const positions = new Set<number>();
    for (const sym of ["AAPL", "TSM", "MC.PA", "JPM", "7203.T", "SHEL.L"])
      for (const q of quiz(sym))
        if (
          ["pe_years", "operating_margin", "dividend_income"].includes(q.rule)
        )
          positions.add(q.answer);
    expect(positions.size).toBeGreaterThan(1);
  });
});

describe("question shape and copy", () => {
  const SYMBOLS = ["AAPL", "RIVN", "SHEL.L", "TSM", "7203.T", "MC.PA", "JPM"];
  const all = SYMBOLS.flatMap((s) => quiz(s).map((q) => [s, q] as const));

  it("every question has 2 or 3 distinct options and a valid answer index", () => {
    expect(all.length).toBeGreaterThan(40);
    for (const [, q] of all) {
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(q.options.length).toBeLessThanOrEqual(3);
      expect(Number.isInteger(q.answer)).toBe(true);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.options.length);
      const sig = q.options.map((o) => JSON.stringify(o));
      expect(new Set(sig).size).toBe(q.options.length);
      expect(isGlossaryId(q.term)).toBe(true);
    }
  });

  it.each([
    ["en", en],
    ["fr", fr],
  ] as const)(
    "every question, option and explanation exists and formats cleanly (%s)",
    (locale, messages) => {
      const t = createTranslator({ locale, messages, namespace: "Quiz" });
      for (const [sym, q] of all) {
        const v = formatQuizParams(q.params, locale);
        const texts = [
          t(`rules.${q.rule}.question` as never, v as never),
          t(`rules.${q.rule}.explain.${q.explain}` as never, v as never),
          ...q.options.map((o) =>
            t(
              `rules.${q.rule}.options.${o.key}` as never,
              {
                ...v,
                ...formatQuizParams(o.params, locale),
              } as never,
            ),
          ),
        ];
        for (const s of texts) {
          const label = `${sym} ${q.rule} ${s}`;
          expect(s.trim(), label).not.toBe("");
          expect(s, label).not.toMatch(BROKEN);
          expect(s, label).not.toMatch(/[{}]/);
          expect(s, label).not.toMatch(ADVICE);
        }
      }
    },
  );

  it("the card adds a standard rule-of-thumb note, in both languages", () => {
    for (const [lang, m] of [
      ["en", en],
      ["fr", fr],
    ] as const) {
      const t = createTranslator({
        locale: lang,
        messages: m,
        namespace: "Quiz",
      });
      expect(t("ruleNote")).toMatch(/rule of thumb|règle empirique/);
    }
    expect(all.some(([, q]) => q.ruleOfThumb)).toBe(true);
    expect(all.some(([, q]) => !q.ruleOfThumb)).toBe(true);
  });

  it("explanations that follow a convention name it as one", () => {
    const rot = ["pe_reading", "payout_ratio", "market_cap_size"] as const;
    for (const [lang, m] of [
      ["en", en],
      ["fr", fr],
    ] as const) {
      for (const rule of rot) {
        const block = (
          m.Quiz.rules as Record<string, { explain: Record<string, string> }>
        )[rule];
        for (const s of Object.values(block.explain))
          expect(s, `${lang} ${rule}`).toMatch(
            /rule of thumb|règle empirique/i,
          );
      }
    }
  });

  it("params are never raw NaN/undefined and quote only data the page shows", () => {
    for (const [, q] of all)
      for (const v of Object.values(q.params))
        if ("n" in v) expect(Number.isFinite(v.n)).toBe(true);
  });
});

describe("QuizCard", () => {
  it.each(["en", "fr"] as const)(
    "renders the first question with its options (%s)",
    (locale) => {
      const html = render(<QuizCard stock={loadStock("AAPL")} />, locale);
      const t = visibleText(html);
      const q = (locale === "en" ? en : fr).Quiz;
      expect(t).toContain(q.title);
      expect(t).toContain(
        locale === "en" ? "Question 1 of 10" : "Question 1 sur 10",
      );
      expect(
        html.match(/aria-pressed="false"/g)!.length,
      ).toBeGreaterThanOrEqual(2);
      expect(html).toContain("Next question".replace("Next question", q.next));
      expect(t.replaceAll("&#x27;", "'")).toContain(q.notAdvice);
      expect(t).not.toMatch(BROKEN);
      // Nothing is revealed before the student answers.
      expect(html).not.toContain('href="/learn#');
      expect(t).not.toContain(q.correct);
    },
  );
  it("shows nothing for a fund, and a calm line when a share has too little data", () => {
    expect(render(<QuizCard stock={loadStock("SPY")} />).trim()).toBe("");
    const s = clone("AAPL");
    s.fundamentals = { value: null, reason: "provider_error" };
    s.earnings = { value: null, reason: "provider_error" };
    s.analysts = { value: null, reason: "provider_error" };
    const t = visibleText(render(<QuizCard stock={s} />));
    expect(t).toContain("not enough data");
    expect(t).not.toMatch(BROKEN);
  });
  it("has no Next button when only one question exists", () => {
    const s = clone("RIVN");
    s.fundamentals.value!.keyStats.operatingMargin = {
      value: 0.1,
      reason: null,
    };
    s.analysts = { value: null, reason: "provider_error" };
    for (const p of [
      ...s.fundamentals.value!.quarterly,
      ...s.fundamentals.value!.annual,
    ])
      p.freeCashFlow = { value: null, reason: "not_reported" };
    s.fundamentals.value!.keyStats.marketCap = {
      value: null,
      reason: "provider_error",
    };
    s.earnings = { value: null, reason: "provider_error" };
    const qs = buildQuiz(s, DAY);
    expect(qs).toHaveLength(1);
    expect(render(<QuizCard stock={s} />)).not.toContain("Next question");
  });
});

describe("Quiz wording", () => {
  const leaves = (n: unknown): string[] =>
    n && typeof n === "object" ? Object.values(n).flatMap(leaves) : [String(n)];
  const keys = (node: unknown, prefix = ""): string[] =>
    node && typeof node === "object"
      ? Object.entries(node).flatMap(([k, v]) =>
          keys(v, prefix ? `${prefix}.${k}` : k),
        )
      : [prefix];
  it("French and English have the same keys", () => {
    expect(keys(fr.Quiz).sort()).toEqual(keys(en.Quiz).sort());
  });
  it("covers every rule, and every explain key a rule can produce", () => {
    for (const m of [en, fr]) {
      const rulesMsg = m.Quiz.rules as Record<
        string,
        { question: string; options: object; explain: object }
      >;
      expect(Object.keys(rulesMsg).sort()).toEqual([...QUIZ_RULE_IDS].sort());
    }
  });
  it("no sentence tells the student what to do with a share", () => {
    for (const [lang, m] of [
      ["en", en],
      ["fr", fr],
    ] as const)
      for (const s of leaves(m.Quiz)) expect(s, lang).not.toMatch(ADVICE);
  });
  it("the quiz is framed as practice, not advice", () => {
    expect(en.Quiz.notAdvice).toMatch(/nothing about what to do/i);
    expect(fr.Quiz.notAdvice).toMatch(/ne disent rien/i);
  });
});
