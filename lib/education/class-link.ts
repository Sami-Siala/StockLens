import { isValidSymbol } from "@/lib/data/local/lists";

/**
 * Teacher links (PLAN §6, Step 5b): `/class?tickers=KO,NVDA,MC.PA&hideAI=1&title=Week 3`.
 * No login and no server storage: the link itself carries the list. A link is untrusted input
 * (anyone can type one), so everything is validated and the title is only ever shown as text.
 */
export const CLASS_MAX_TICKERS = 12;
export const CLASS_TITLE_MAX = 80;

export interface ClassLink {
  /** Valid, upper-cased, de-duplicated, at most `CLASS_MAX_TICKERS`. */
  tickers: string[];
  hideAi: boolean;
  /** Plain text, clipped, `""` when none. */
  title: string;
}

/** What was dropped while reading a link (shown calmly so a teacher can fix a typo). */
export interface ClassLinkIssues {
  /** Entries that are not tickers (at most 5, each clipped for display). */
  invalid: string[];
  /** How many valid, distinct tickers were left out because the list is full. */
  overflow: number;
}

export interface ParsedClassLink extends ClassLink {
  issues: ClassLinkIssues;
}

// Control characters and the bidi overrides that can make a title read backwards.
const HIDDEN = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;

/** Plain, single-line, at most `CLASS_TITLE_MAX` characters (counted as characters, not UTF-16 units). */
export function cleanTitle(v: unknown): string {
  if (typeof v !== "string") return "";
  const flat = v.replace(HIDDEN, " ").replace(/\s+/g, " ").trim();
  return Array.from(flat).slice(0, CLASS_TITLE_MAX).join("").trim();
}

const show = (s: string) => (s.length > 14 ? `${s.slice(0, 13)}…` : s);

/** Split a raw `tickers` value: commas, spaces and semicolons all separate. */
function pieces(raw: string): string[] {
  return raw.split(/[\s,;]+/).filter((s) => s !== "");
}

export function parseTickers(raw: string): {
  tickers: string[];
  issues: ClassLinkIssues;
} {
  const tickers: string[] = [];
  const invalid: string[] = [];
  let overflow = 0;
  const seen = new Set<string>();
  for (const piece of pieces(raw)) {
    if (!isValidSymbol(piece)) {
      if (invalid.length < 5) invalid.push(show(piece));
      continue;
    }
    const sym = piece.toUpperCase();
    if (seen.has(sym)) continue;
    seen.add(sym);
    if (tickers.length < CLASS_MAX_TICKERS) tickers.push(sym);
    else overflow++;
  }
  return { tickers, issues: { invalid, overflow } };
}

/** Read a `location.search` string (with or without the leading `?`). Never throws. */
export function parseClassLink(search: string): ParsedClassLink {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    params = new URLSearchParams();
  }
  const { tickers, issues } = parseTickers(params.get("tickers") ?? "");
  const flag = params.get("hideAI");
  return {
    tickers,
    issues,
    hideAi: flag === "1" || flag === "true",
    title: cleanTitle(params.get("title")),
  };
}

/** Re-validate a link that came from somewhere else (local storage). */
export function normaliseClassLink(v: unknown): ClassLink | null {
  if (!v || typeof v !== "object") return null;
  const { tickers, hideAi, title } = v as Record<string, unknown>;
  if (!Array.isArray(tickers)) return null;
  const parsed = parseTickers(
    tickers.filter((t): t is string => typeof t === "string").join(","),
  );
  if (parsed.tickers.length === 0) return null;
  return {
    tickers: parsed.tickers,
    hideAi: hideAi === true,
    title: cleanTitle(title),
  };
}

/** `tickers=KO,NVDA,MC.PA&hideAI=1&title=...` (commas stay readable; each ticker is encoded). */
export function classQuery(link: ClassLink): string {
  const parts = [
    `tickers=${link.tickers.slice(0, CLASS_MAX_TICKERS).map(encodeURIComponent).join(",")}`,
  ];
  if (link.hideAi) parts.push("hideAI=1");
  const title = cleanTitle(link.title);
  if (title) parts.push(`title=${encodeURIComponent(title)}`);
  return parts.join("&");
}

/** Locale-free path for the app's own `Link` (it adds the locale). */
export const classHref = (link: ClassLink) => `/class?${classQuery(link)}`;

/** The absolute URL a teacher shares. */
export const classUrl = (link: ClassLink, origin: string, locale: string) =>
  `${origin}/${locale}${classHref(link)}`;

/** A company page, carrying the teacher's hide-AI choice (read by components/stock/ai-flag.ts). */
export const stockHref = (symbol: string, hideAi: boolean) =>
  `/stock/${encodeURIComponent(symbol)}${hideAi ? "?hideAI=1" : ""}`;
