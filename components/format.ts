/**
 * Locale-aware number, money, percent and date formatting. Pure functions (testable).
 * Every function returns a string and never "NaN" / "undefined": callers pass possibly
 * missing numbers through `isNum` first, and these guards are the second line of defence.
 */

export const isNum = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);

/** Sub-unit or non-ISO codes (GBp = pence, ZAc, ILA). Intl would wrongly treat "GBp" as GBP. */
function isSubUnit(code: string): boolean {
  return code !== code.toUpperCase() || code === "ILA";
}

function validIso(code: string): boolean {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: code });
    return true;
  } catch {
    return false;
  }
}

export function formatNumber(
  n: number,
  locale: string,
  opts: Intl.NumberFormatOptions = {},
): string {
  if (!isNum(n)) return "";
  return new Intl.NumberFormat(locale, opts).format(n);
}

/** Price-like money: "343.53 USD" style via Intl for ISO codes, "123.4 GBp" for pence. */
export function formatMoney(
  amount: number,
  currency: string,
  locale: string,
  opts: { compact?: boolean; maxFraction?: number; minFraction?: number } = {},
): string {
  if (!isNum(amount)) return "";
  const compact = opts.compact ? ({ notation: "compact" } as const) : {};
  const digits =
    opts.maxFraction !== undefined
      ? {
          ...(opts.minFraction !== undefined
            ? {
                minimumFractionDigits: Math.min(
                  opts.minFraction,
                  opts.maxFraction,
                ),
              }
            : {}),
          maximumFractionDigits: opts.maxFraction,
        }
      : opts.compact
        ? { maximumFractionDigits: 2 }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  if (isSubUnit(currency) || !validIso(currency)) {
    return `${new Intl.NumberFormat(locale, { ...compact, ...digits }).format(amount)} ${currency}`;
  }
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "code",
    ...compact,
    ...digits,
  })
    .format(amount)
    .replace(/ /g, " ");
}

/** Fraction -> percent: 0.0575 -> "5.8 %" (fr) / "5.8%" (en). `signed` adds + / −. */
export function formatPercent(
  fraction: number,
  locale: string,
  opts: { signed?: boolean; digits?: number } = {},
): string {
  if (!isNum(fraction)) return "";
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: opts.digits ?? 1,
    maximumFractionDigits: opts.digits ?? 1,
    signDisplay: opts.signed ? "exceptZero" : "auto",
  }).format(fraction);
}

/** "Sep 2026" / "sept. 2026". Input is an ISO calendar date, read as UTC. */
export function formatMonthYear(isoDate: string, locale: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export function formatDate(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/** Time of day in the exchange's own timezone, e.g. "17:35 CET". */
export function formatExchangeTime(
  iso: string,
  timeZone: string,
  locale: string,
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
      timeZoneName: "short",
    }).format(d);
  } catch {
    return "";
  }
}

/** Candle timestamp (unix seconds) formatted in the exchange timezone. */
export function formatCandleTime(
  seconds: number,
  timeZone: string,
  locale: string,
  parts: "time" | "date" | "datetime",
): string {
  const opts: Intl.DateTimeFormatOptions = { timeZone };
  if (parts !== "time") {
    opts.day = "numeric";
    opts.month = "short";
    if (parts === "date") opts.year = "2-digit";
  }
  if (parts !== "date") {
    opts.hour = "2-digit";
    opts.minute = "2-digit";
  }
  try {
    return new Intl.DateTimeFormat(locale, opts).format(
      new Date(seconds * 1000),
    );
  } catch {
    return "";
  }
}

/** "#1a7f37" + 0.2 -> "rgba(26,127,55,0.2)". Non-hex input is returned unchanged. */
export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
