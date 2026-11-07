/**
 * Rule-based quiz (PLAN §5, Step 5c). Deterministic and free: every question is computed from the
 * StockSnapshot with the same selectors the key cards use. No AI, nothing random (the "random"
 * order is a hash of symbol + Paris calendar day, so a reload shows the same quiz).
 *
 * A rule produces a question ONLY when every number it needs is present, finite and in a
 * comparable currency. Funds (ETFs...) get no quiz. Answers are either arithmetic (P/E = price ÷
 * EPS, forward below trailing = higher expected profit...) or a labelled RULE OF THUMB
 * (`ruleOfThumb: true`): the explanation then says so. Nothing here tells anyone what to buy or sell.
 *
 * This file builds language-free questions (ids and raw numbers). The words live in
 * `messages/*.json` under `Quiz.rules.<rule>` (question, options.<key>, explain.<explain>), which
 * the professor reviews; `components/stock/quiz-card.tsx` formats the numbers for the locale.
 */
import { isNum } from "@/components/format";
import { epsVerdict, fromMetric, selectors } from "@/components/stock/metrics";
import type { StockSnapshot } from "@/lib/contract";
import { parisDayNumber, type GlossaryId } from "./glossary";

export type QuizRuleId =
  | "pe_years"
  | "pe_reading"
  | "eps_surprise"
  | "forward_vs_trailing"
  | "dividend_income"
  | "payout_ratio"
  | "price_vs_target"
  | "market_cap_size"
  | "operating_margin"
  | "operating_loss"
  | "free_cash_flow";

/** A number (or word) in a question, with just enough to format it for a locale later. */
export type QuizValue =
  | { kind: "number"; n: number; digits?: number }
  | { kind: "percent"; n: number; digits?: number }
  | {
      kind: "money";
      n: number;
      currency: string;
      /** Exact number of decimals (e.g. 1 for "3.1"). */
      fraction?: number;
      compact?: boolean;
    }
  | { kind: "month"; iso: string }
  | { kind: "text"; s: string };

export type QuizParams = Record<string, QuizValue>;

export interface QuizOption {
  /** Message key under `Quiz.rules.<rule>.options`. Numeric options all share one key. */
  key: string;
  params?: QuizParams;
}

export interface QuizQuestion {
  rule: QuizRuleId;
  /** Glossary term the explanation links to (`/learn#<term>`). */
  term: GlossaryId;
  /** Shared by the question and the explanation text. */
  params: QuizParams;
  options: QuizOption[];
  /** Index into `options`. */
  answer: number;
  /** Message key under `Quiz.rules.<rule>.explain`. */
  explain: string;
  /** True when the right answer follows a convention, not arithmetic: the UI says so. */
  ruleOfThumb: boolean;
}

type Draft = Omit<QuizQuestion, "rule"> & {
  /** Natural order (beat / in line / miss, low / mid / high): keep it, do not shuffle. */
  ordered?: boolean;
};

const num = (n: number, digits?: number): QuizValue => ({
  kind: "number",
  n,
  digits,
});
const pct = (n: number, digits?: number): QuizValue => ({
  kind: "percent",
  n,
  digits,
});
const money = (
  n: number,
  currency: string,
  fraction?: number,
  compact = false,
): QuizValue => ({ kind: "money", n, currency, fraction, compact });

/** Third-party text: plain, short, without control characters. */
export function cleanName(v: string): string {
  return v
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, 60);
}

/** Currencies whose "billion" is close enough for the size groups below to mean the same thing. */
export const SIZE_CURRENCIES = ["USD", "EUR", "GBP", "CHF"] as const;
export const SIZE_LARGE = 10e9;
export const SIZE_MEGA = 200e9;
/** A target within this fraction of the price counts as "about the same". */
export const TARGET_BAND = 0.02;
/** Forward and trailing P/E closer than this are "about the same": no question. */
export const PE_GAP_MIN = 0.03;
export const PE_HIGH = 25;
export const PE_LOW = 12;
export const PAYOUT_LOW = 0.35;
export const PAYOUT_HIGH = 0.7;

interface Ctx {
  s: ReturnType<typeof selectors>;
  stock: StockSnapshot;
  name: string;
  priceCurrency: string;
}

type Rule = (c: Ctx) => Draft | null;

const positive = (n: unknown): n is number => isNum(n) && n > 0;

/** Distinct wrong numbers around the right one, never equal to it or to each other. */
function distractors(right: number, candidates: number[]): number[] | null {
  const out: number[] = [];
  for (const c of candidates) {
    if (c >= 1 && c !== right && !out.includes(c)) out.push(c);
    if (out.length === 2) return out;
  }
  return null;
}

const RULES: Record<QuizRuleId, Rule> = {
  pe_years({ s, name }) {
    const pe = s.trailingPE.ok ? s.trailingPE.value : null;
    if (!positive(pe) || pe < 1.5 || pe > 500) return null;
    const years = Math.round(pe);
    const wrong = distractors(years, [
      years * 2,
      Math.round(years / 2),
      years * 3,
      years + 5,
    ]);
    if (!wrong) return null;
    const opt = (n: number): QuizOption => ({
      key: "years",
      params: { n: num(n, 0) },
    });
    return {
      term: "pe",
      params: {
        name: { kind: "text", s: name },
        pe: num(pe, 1),
        n: num(years, 0),
      },
      options: [opt(years), opt(wrong[0]), opt(wrong[1])],
      answer: 0,
      explain: "default",
      ruleOfThumb: false,
    };
  },

  pe_reading({ s, name }) {
    const pe = s.trailingPE.ok ? s.trailingPE.value : null;
    if (!positive(pe) || pe > 500) return null;
    // Between the two lines the rule of thumb has nothing clear to say: no question.
    const high = pe >= PE_HIGH;
    if (!high && pe > PE_LOW) return null;
    return {
      term: "pe",
      params: { name: { kind: "text", s: name }, pe: num(pe, 1) },
      options: [{ key: "growth" }, { key: "steady" }],
      answer: high ? 0 : 1,
      explain: high ? "growth" : "steady",
      ruleOfThumb: true,
    };
  },

  eps_surprise({ s, name }) {
    const e = s.eps.ok ? s.eps.value : null;
    if (
      !e ||
      !isNum(e.epsActual) ||
      !isNum(e.epsEstimate) ||
      !isNum(e.difference) ||
      !isNum(e.surprise) ||
      typeof e.currency !== "string" ||
      e.currency === ""
    )
      return null;
    const verdict = epsVerdict(e.difference, e.surprise);
    return {
      term: "eps",
      params: {
        name: { kind: "text", s: name },
        actual: money(e.epsActual, e.currency),
        estimate: money(e.epsEstimate, e.currency),
        pct: pct(Math.abs(e.surprise)),
        quarter: { kind: "month", iso: e.quarterEnd },
      },
      options: [{ key: "beat" }, { key: "inline" }, { key: "miss" }],
      answer: verdict === "beat" ? 0 : verdict === "inline" ? 1 : 2,
      explain: verdict,
      ruleOfThumb: verdict === "inline",
      ordered: true,
    };
  },

  forward_vs_trailing({ s, name }) {
    const t = s.trailingPE.ok ? s.trailingPE.value : null;
    const f = s.forwardPE.ok ? s.forwardPE.value : null;
    if (!positive(t) || !positive(f) || t > 500 || f > 500) return null;
    if (Math.abs(f / t - 1) < PE_GAP_MIN) return null;
    return {
      term: "forward_pe",
      params: {
        name: { kind: "text", s: name },
        trailing: num(t, 1),
        forward: num(f, 1),
      },
      options: [{ key: "higher" }, { key: "lower" }],
      answer: f < t ? 0 : 1,
      explain: f < t ? "higher" : "lower",
      ruleOfThumb: false,
    };
  },

  dividend_income({ stock, name, priceCurrency }) {
    const k = fromMetric(stock.fundamentals);
    const y = k.ok ? fromMetric(k.value.keyStats.dividendYield) : null;
    if (!y || !y.ok || !positive(y.value) || y.value > 0.25) return null;
    const stake = 1000;
    const income = stake * y.value;
    const digits = income >= 10 ? 0 : 1;
    const right = Number(income.toFixed(digits));
    const wrong = distractors(right, [
      Number((income * 10).toFixed(digits)),
      Number((income / 10).toFixed(Math.max(digits, 1))),
      Number((income * 3).toFixed(digits)),
    ]);
    // `distractors` skips values under 1; tiny incomes are not worth a question anyway.
    if (!wrong || right < 1) return null;
    const opt = (n: number): QuizOption => ({
      key: "amount",
      params: { amount: money(n, priceCurrency, digits) },
    });
    return {
      term: "dividend_yield",
      params: {
        name: { kind: "text", s: name },
        yield: pct(y.value, 2),
        stake: money(stake, priceCurrency, 0),
        amount: money(right, priceCurrency, digits),
      },
      options: [opt(right), opt(wrong[0]), opt(wrong[1])],
      answer: 0,
      explain: "default",
      ruleOfThumb: false,
    };
  },

  payout_ratio({ stock, name }) {
    const k = fromMetric(stock.fundamentals);
    const p = k.ok ? fromMetric(k.value.keyStats.payoutRatio) : null;
    if (!p || !p.ok || !positive(p.value) || p.value > 3) return null;
    const bucket =
      p.value < PAYOUT_LOW ? "low" : p.value <= PAYOUT_HIGH ? "mid" : "high";
    return {
      term: "payout_ratio",
      params: { name: { kind: "text", s: name }, ratio: pct(p.value, 0) },
      options: [{ key: "low" }, { key: "mid" }, { key: "high" }],
      answer: bucket === "low" ? 0 : bucket === "mid" ? 1 : 2,
      explain: bucket,
      ruleOfThumb: true,
      ordered: true,
    };
  },

  price_vs_target({ stock, name, priceCurrency }) {
    const q = fromMetric(stock.quote);
    const a = fromMetric(stock.analysts);
    const t = a.ok ? fromMetric(a.value.priceTarget) : null;
    if (!q.ok || !t || !t.ok) return null;
    const price = q.value.price;
    const target = t.value;
    // Never compare a target with a price in another currency (TSM-style statement currencies).
    if (price.currency !== priceCurrency || target.currency !== priceCurrency)
      return null;
    if (![price.amount, target.low, target.mean, target.high].every(positive))
      return null;
    if (!(target.low <= target.mean && target.mean <= target.high)) return null;
    const gap = (target.mean - price.amount) / price.amount;
    const side =
      Math.abs(gap) < TARGET_BAND ? "same" : gap > 0 ? "above" : "below";
    return {
      term: "analyst_target",
      params: {
        name: { kind: "text", s: name },
        price: money(price.amount, priceCurrency),
        mean: money(target.mean, priceCurrency),
        low: money(target.low, priceCurrency),
        high: money(target.high, priceCurrency),
        gap: pct(Math.abs(gap)),
        band: pct(TARGET_BAND, 0),
      },
      options: [{ key: "above" }, { key: "same" }, { key: "below" }],
      answer: side === "above" ? 0 : side === "same" ? 1 : 2,
      explain: side,
      ruleOfThumb: side === "same",
      ordered: true,
    };
  },

  market_cap_size({ s, name }) {
    const m = s.marketCap.ok ? s.marketCap.value : null;
    if (!m || !positive(m.amount)) return null;
    if (!(SIZE_CURRENCIES as readonly string[]).includes(m.currency))
      return null;
    const size =
      m.amount >= SIZE_MEGA
        ? "mega"
        : m.amount >= SIZE_LARGE
          ? "large"
          : "small";
    return {
      term: "market_cap",
      params: {
        name: { kind: "text", s: name },
        cap: money(m.amount, m.currency, undefined, true),
      },
      options: [{ key: "small" }, { key: "large" }, { key: "mega" }],
      answer: size === "small" ? 0 : size === "large" ? 1 : 2,
      explain: size,
      ruleOfThumb: true,
      ordered: true,
    };
  },

  operating_margin({ s, name }) {
    const m = s.operatingMargin.ok ? s.operatingMargin.value : null;
    if (!isNum(m) || m < 0.01 || m > 0.9) return null;
    const x = Math.round(m * 100);
    const wrong = distractors(x, [
      100 - x,
      Math.round(x / 2),
      x * 2 <= 99 ? x * 2 : x + 10,
      x + 10,
      x - 10,
    ]);
    if (!wrong) return null;
    const opt = (n: number): QuizOption => ({
      key: "per100",
      params: { n: num(n, 0) },
    });
    return {
      term: "operating_margin",
      params: {
        name: { kind: "text", s: name },
        margin: pct(m),
        n: num(x, 0),
      },
      options: [opt(x), opt(wrong[0]), opt(wrong[1])],
      answer: 0,
      explain: "default",
      ruleOfThumb: false,
    };
  },

  operating_loss({ s, name }) {
    const m = s.operatingMargin.ok ? s.operatingMargin.value : null;
    if (!isNum(m) || m >= 0 || m < -50) return null;
    return {
      term: "operating_margin",
      params: { name: { kind: "text", s: name }, margin: pct(m) },
      options: [{ key: "costs" }, { key: "cash" }, { key: "sales" }],
      answer: 0,
      explain: "default",
      ruleOfThumb: false,
    };
  },

  free_cash_flow({ s, name }) {
    const f = s.freeCashFlow.ok ? s.freeCashFlow.value : null;
    if (!f || !isNum(f.value) || f.value === 0) return null;
    const positiveFcf = f.value > 0;
    return {
      term: "free_cash_flow",
      params: {
        name: { kind: "text", s: name },
        fcf: money(f.value, f.currency, undefined, true),
      },
      options: [{ key: "in" }, { key: "out" }],
      answer: positiveFcf ? 0 : 1,
      explain: positiveFcf ? "positive" : "negative",
      ruleOfThumb: false,
    };
  },
};

/** The order rules are tried in; the shown order is shuffled per symbol and day. */
export const QUIZ_RULE_IDS = Object.keys(RULES) as QuizRuleId[];

/* ---------- deterministic order ---------- */

/** FNV-1a: a tiny, stable string hash (no randomness anywhere in the quiz). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32: a seeded generator, same sequence for the same seed. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A permutation of 0..n-1 that depends only on `seed`. */
export function seededOrder(n: number, seed: string): number[] {
  const next = rng(hashString(seed));
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

/** "2026-11-07"-style key of the Paris calendar day: the quiz order changes once a day. */
export function quizDayKey(now: Date): string {
  return String(parisDayNumber(now));
}

/**
 * All questions this company supports, in the order for (symbol, day). Empty for anything that
 * is not a plain company share (ETFs, indices...) and when no rule has the data it needs.
 */
export function buildQuiz(
  stock: StockSnapshot,
  now: Date = new Date(),
): QuizQuestion[] {
  const { listing } = stock;
  if (listing.quoteType !== "EQUITY") return [];
  const priceCurrency = listing.priceCurrency;
  if (typeof priceCurrency !== "string" || priceCurrency === "") return [];
  const ctx: Ctx = {
    s: selectors(stock),
    stock,
    name: cleanName(listing.shortName ?? listing.name ?? listing.symbol),
    priceCurrency,
  };
  const day = quizDayKey(now);
  const seed = `${listing.symbol.toUpperCase()}|${day}`;

  const found: QuizQuestion[] = [];
  for (const rule of QUIZ_RULE_IDS) {
    let draft: Draft | null = null;
    try {
      draft = RULES[rule](ctx);
    } catch {
      draft = null; // a rule that trips on odd data is skipped, never fatal
    }
    if (!draft) continue;
    let { options, answer } = draft;
    if (!draft.ordered) {
      const perm = seededOrder(options.length, `${seed}|${rule}`);
      options = perm.map((i) => draft.options[i]);
      answer = perm.indexOf(draft.answer);
    }
    const { ordered, ...rest } = draft;
    void ordered;
    found.push({ ...rest, rule, options, answer });
  }
  return seededOrder(found.length, seed).map((i) => found[i]);
}
