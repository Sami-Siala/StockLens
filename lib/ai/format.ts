import type { AiLanguage } from "@/lib/contract";

/** The locale the rendered numbers follow: the language of the text they sit in. */
export const localeOf = (lang: AiLanguage) =>
  lang === "fr" ? "fr-FR" : "en-US";

function safe(fn: () => string, fallback: string): string {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** "$3.2T" / "3,2 Bn $US". Unknown or sub-unit codes (never expected, the provider converts) keep the code. */
export function moneyCompact(
  amount: number,
  currency: string,
  lang: AiLanguage,
): string {
  const locale = localeOf(lang);
  return safe(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        notation: "compact",
        maximumFractionDigits: 2,
      }).format(amount),
    `${new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 2 }).format(amount)} ${currency}`,
  );
}

/** "$212.40". */
export function money(
  amount: number,
  currency: string,
  lang: AiLanguage,
): string {
  const locale = localeOf(lang);
  return safe(
    () =>
      new Intl.NumberFormat(locale, { style: "currency", currency }).format(
        amount,
      ),
    `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(amount)} ${currency}`,
  );
}

/** A FRACTION (0.0312) as "3.1%". `signed` adds an explicit + for gains. */
export function percent(
  fraction: number,
  lang: AiLanguage,
  opts: { signed?: boolean; digits?: number } = {},
): string {
  return new Intl.NumberFormat(localeOf(lang), {
    style: "percent",
    maximumFractionDigits: opts.digits ?? 1,
    signDisplay: opts.signed ? "exceptZero" : "auto",
  }).format(fraction);
}

/** A plain ratio such as a P/E: "34.2". */
export function ratio(x: number, lang: AiLanguage, digits = 1): string {
  return new Intl.NumberFormat(localeOf(lang), {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(x);
}

export function count(x: number, lang: AiLanguage): string {
  return new Intl.NumberFormat(localeOf(lang), {
    maximumFractionDigits: 0,
  }).format(x);
}

/** "5 Nov 2026" from an ISO date or timestamp, always read in UTC so it never shifts a day. */
export function dateLabel(iso: string, lang: AiLanguage): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(localeOf(lang), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}
