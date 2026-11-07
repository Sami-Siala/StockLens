/**
 * Margin of safety (club Séance 4, glossary term `margin_of_safety`): the student types THEIR OWN
 * estimate of what one share is worth, and we show the gap against the current price.
 *
 *   margin of safety = (estimate − price) ÷ estimate
 *
 * Pure functions, no I/O. The estimate is the student's opinion: nothing here predicts anything
 * or says what to do with the number. Copy lives in `messages/*.json` (`Safety.*`).
 */

/** Largest estimate accepted, per share (Berkshire A trades near 700 000). */
export const ESTIMATE_MAX = 10_000_000;
/** Smallest estimate accepted (penny stocks exist; zero and negatives do not make sense here). */
export const ESTIMATE_MIN = 0.0001;
/** Longest text we even try to read. */
export const ESTIMATE_MAX_CHARS = 24;

export type EstimateProblem =
  /** Nothing typed yet: not an error, just no result. */
  | "empty"
  /** Not a number ("abc", "12abc", "1e5", "1,2,3"). */
  | "invalid"
  /** Zero or negative. */
  | "not_positive"
  /** Above `ESTIMATE_MAX`. */
  | "too_large";

export type ParsedEstimate =
  { ok: true; value: number } | { ok: false; problem: EstimateProblem };

const GROUPING_SPACES = /[\s  ']/g;
const bad = (problem: EstimateProblem): ParsedEstimate => ({
  ok: false,
  problem,
});

/**
 * Read what the student typed. Accepts a decimal comma or point ("12,5", "12.5"), spaces or
 * apostrophes as thousands separators ("1 234,5"), and "1,234.56" / "1.234,56" (the LAST
 * separator is the decimal one when both appear). One lone separator is a decimal point, except
 * an English-style "1,234" (comma, exactly three digits after, English locale) which is a thousand.
 * Anything else, including signs, exponents and currency symbols, is `invalid`.
 */
export function parseEstimate(raw: string, locale = "en"): ParsedEstimate {
  if (typeof raw !== "string") return bad("invalid");
  const s = raw.trim().replace(GROUPING_SPACES, "");
  if (s === "") return bad("empty");
  if (raw.length > ESTIMATE_MAX_CHARS) return bad("invalid");
  // A leading minus is a different problem from garbage: say "positive", not "not a number".
  if (/^-\s*\d/.test(raw.trim()) && /^-\d*[.,]?\d*$/.test(s))
    return bad("not_positive");
  if (!/^[\d.,]+$/.test(s)) return bad("invalid");

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  let normal: string;

  if (dots > 0 && commas > 0) {
    const decimal = lastDot > lastComma ? "." : ",";
    const group = decimal === "." ? "," : ".";
    // The group separator must only appear before the decimal one.
    if ((decimal === "." ? dots : commas) > 1) return bad("invalid");
    if (s.lastIndexOf(group) > s.lastIndexOf(decimal)) return bad("invalid");
    normal = s.split(group).join("").replace(decimal, ".");
  } else if (dots > 1 || commas > 1) {
    // Repeated separator = thousands ("1.234.567" / "1,234,567").
    const sep = dots > 1 ? "." : ",";
    const groups = s.split(sep);
    if (!groups.slice(1).every((g) => g.length === 3)) return bad("invalid");
    normal = groups.join("");
  } else if (dots === 1 || commas === 1) {
    const sep = dots === 1 ? "." : ",";
    const [head, tail] = s.split(sep);
    const englishThousand =
      sep === "," && locale === "en" && tail.length === 3 && head.length > 0;
    // "12," while typing is just "12".
    normal = englishThousand
      ? head + tail
      : tail === "" && head !== ""
        ? head
        : `${head}.${tail}`;
  } else {
    normal = s;
  }

  if (!/^\d+(\.\d+)?$/.test(normal) && !/^\.\d+$/.test(normal))
    return bad("invalid");
  const value = Number(normal.startsWith(".") ? `0${normal}` : normal);
  if (!Number.isFinite(value)) return bad("invalid");
  if (value <= 0) return bad("not_positive");
  if (value < ESTIMATE_MIN) return bad("not_positive");
  if (value > ESTIMATE_MAX) return bad("too_large");
  return { ok: true, value };
}

export type MarginSide = "below" | "above" | "about_equal";

export interface Margin {
  /** (estimate − price) ÷ estimate. Positive = the price is below the estimate. */
  margin: number;
  /** Absolute value of `margin`, for the sentence ("12.0 % below"). */
  size: number;
  /** Where the price sits relative to the student's estimate. */
  side: MarginSide;
  /** (estimate − price) ÷ price: the same gap measured from the price, for the second line. */
  upside: number;
  /** True when the estimate is more than 10x or less than a tenth of the price: probably a typo or a wrong unit. */
  farFromPrice: boolean;
}

/** Gaps under this (0.5 percentage point) read as "about equal". */
export const ABOUT_EQUAL = 0.005;

/**
 * Compare the student's estimate with the current price (both per share, same currency).
 * Returns null when either number cannot be used: no division by zero, no NaN, ever.
 */
export function marginOfSafety(price: number, estimate: number): Margin | null {
  if (!Number.isFinite(price) || !Number.isFinite(estimate)) return null;
  if (price <= 0 || estimate <= 0) return null;
  const margin = (estimate - price) / estimate;
  const side: MarginSide =
    Math.abs(margin) < ABOUT_EQUAL
      ? "about_equal"
      : margin > 0
        ? "below"
        : "above";
  const ratio = estimate / price;
  return {
    margin,
    size: Math.abs(margin),
    side,
    upside: (estimate - price) / price,
    farFromPrice: ratio >= 10 || ratio <= 0.1,
  };
}

/** The currency must be a plain ISO-style major unit: never ask for an estimate in "pence" by accident. */
export function isMajorCurrency(code: unknown): code is string {
  return typeof code === "string" && /^[A-Z]{3}$/.test(code) && code !== "ILA";
}
