/**
 * Builds the one-page summary (`ExportDoc`, lib/education/export.ts) from what the stock page
 * shows: the same selectors as the key cards, the student's own notes / pick / estimate, and the AI
 * columns ONLY when they are loaded and visible. Pure: texts come from a translator, numbers from
 * `components/format.ts`, so it is testable with the real message files.
 */
import type { StockSnapshot, Thesis } from "@/lib/contract";
import {
  EXPORT_AI_ITEMS,
  plainText,
  type ExportColumn,
  type ExportDoc,
  type ExportRow,
} from "@/lib/education/export";
import { marginOfSafety } from "@/lib/education/margin-of-safety";
import type { NoteEntry, Pick } from "@/lib/data/local/notes";
import {
  formatMoney,
  formatMonthYear,
  formatNumber,
  formatPercent,
  isNum,
} from "../format";
import { groupRatings } from "./analyst-section";
import { epsVerdict, fromMetric, selectors } from "./metrics";
import { textList } from "./thesis-logic";

export type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export interface ExportArgs {
  stock: StockSnapshot;
  locale: string;
  /** Translator for the `Export` namespace. */
  t: Translate;
  /** Label of a pick ("Hold" / "Conserver"), from `Turn.pick.*`. */
  pickLabel: (p: Pick) => string;
  entry?: NoteEntry;
  /** The AI thesis, only when it is loaded AND visible (not under `?hideAI=1`). */
  thesis?: Thesis | null;
  now?: Date;
}

const periodKey = (length: string) =>
  length === "3M" ? "quarter" : length === "6M" ? "half" : "year";

function dateText(now: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Paris",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Key numbers in the same order as the cards; only the ones that exist. */
export function keyRows(
  stock: StockSnapshot,
  locale: string,
  t: Translate,
): ExportRow[] {
  const s = selectors(stock);
  const rows: ExportRow[] = [];
  const price = stock.listing.priceCurrency;

  if (s.eps.ok) {
    const e = s.eps.value;
    if (isNum(e.epsActual) && isNum(e.epsEstimate)) {
      const v = epsVerdict(e.difference, e.surprise);
      rows.push({
        label: t("rows.eps"),
        value: t("values.eps", {
          actual: formatMoney(e.epsActual, e.currency, locale),
          estimate: formatMoney(e.epsEstimate, e.currency, locale),
          verdict: t(`verdict.${v}`),
        }),
      });
    }
  }

  const tpe =
    s.trailingPE.ok && isNum(s.trailingPE.value) ? s.trailingPE.value : null;
  const fpe =
    s.forwardPE.ok && isNum(s.forwardPE.value) ? s.forwardPE.value : null;
  if (tpe !== null || fpe !== null) {
    const f = (n: number | null) =>
      n === null
        ? t("na")
        : formatNumber(n, locale, { maximumFractionDigits: 1 });
    rows.push({
      label: t("rows.pe"),
      value: t("values.pe", { trailing: f(tpe), forward: f(fpe) }),
    });
  }

  const line = (
    key: "rows.revenue" | "rows.operating" | "rows.fcf",
    pick: typeof s.revenue,
    extra?: string,
  ) => {
    if (!pick.ok) return;
    const p = pick.value;
    const money = formatMoney(p.value, p.currency, locale, { compact: true });
    rows.push({
      label: t(key, {
        period: t(`period.${periodKey(p.length)}`, {
          date: formatMonthYear(p.periodEnd, locale),
        }),
      }),
      value:
        (extra ? `${money} (${extra})` : money) +
        (p.currency !== price
          ? ` - ${t("reportedIn", { currency: p.currency })}`
          : ""),
    });
  };
  line("rows.revenue", s.revenue);
  line(
    "rows.operating",
    s.operatingIncome,
    s.operatingMargin.ok && isNum(s.operatingMargin.value)
      ? t("values.margin", {
          pct: formatPercent(s.operatingMargin.value, locale),
        })
      : undefined,
  );
  line("rows.fcf", s.freeCashFlow);

  if (s.marketCap.ok)
    rows.push({
      label: t("rows.marketCap"),
      value: formatMoney(
        s.marketCap.value.amount,
        s.marketCap.value.currency,
        locale,
        { compact: true },
      ),
    });

  const analysts = fromMetric(stock.analysts);
  if (analysts.ok) {
    const ratings = fromMetric(analysts.value.ratings);
    if (ratings.ok) {
      const g = groupRatings(ratings.value);
      if (g.total > 0)
        rows.push({
          label: t("rows.ratings"),
          value: t("values.ratings", {
            pos: g.buy,
            neu: g.hold,
            neg: g.sell,
          }),
        });
    }
    const target = fromMetric(analysts.value.priceTarget);
    // Same rule as the page: a target in another currency than the price is not shown.
    if (
      target.ok &&
      target.value.currency === price &&
      [target.value.low, target.value.mean, target.value.high].every(isNum)
    ) {
      const m = (n: number) => formatMoney(n, price, locale);
      rows.push({
        label: t("rows.target"),
        value: t("values.target", {
          low: m(target.value.low),
          mean: m(target.value.mean),
          high: m(target.value.high),
        }),
      });
    }
  }
  return rows;
}

export function buildExportDoc(a: ExportArgs): ExportDoc {
  const { stock, locale, t } = a;
  const now = a.now ?? new Date();
  const { listing } = stock;
  const q = fromMetric(stock.quote);

  let priceLine: string | null = null;
  let priceAmount: number | null = null;
  if (q.ok && isNum(q.value.price.amount)) {
    priceAmount = q.value.price.amount;
    const d = q.value.delayMinutes;
    const status = isNum(d)
      ? d > 0
        ? t("price.delayed", { minutes: d })
        : t("price.realtime")
      : t("price.maybeDelayed");
    priceLine = t("price.line", {
      price: formatMoney(q.value.price.amount, q.value.price.currency, locale),
      status,
    });
  }

  const entry = a.entry;
  const pick = entry?.pick ?? null;

  let estimate: ExportDoc["estimate"] = null;
  if (
    entry?.estimate &&
    entry.estimate.currency === listing.priceCurrency &&
    priceAmount !== null
  ) {
    const m = marginOfSafety(priceAmount, entry.estimate.amount);
    const lines = [
      t("estimate.line", {
        estimate: formatMoney(
          entry.estimate.amount,
          entry.estimate.currency,
          locale,
        ),
      }),
    ];
    if (m)
      lines.push(
        t(`estimate.gap.${m.side}`, {
          pct: formatPercent(m.size, locale),
          margin: formatPercent(m.margin, locale),
        }),
      );
    lines.push(t("estimate.notAdvice"));
    estimate = { title: t("estimate.title"), lines };
  }

  let ai: ExportDoc["ai"] = null;
  if (a.thesis) {
    const col = (
      id: "for" | "against" | "wait",
      items: unknown,
    ): ExportColumn => ({
      title: t(`ai.${id}`),
      items: textList(items)
        .slice(0, EXPORT_AI_ITEMS)
        .map((s) => plainText(s)),
    });
    const columns = [
      col("for", a.thesis.bullCase),
      col("against", a.thesis.bearCase),
      col("wait", a.thesis.holdCase),
    ];
    if (columns.some((c) => c.items.length > 0))
      ai = { title: t("ai.title"), note: t("ai.note"), columns };
  }

  return {
    heading: t("heading"),
    company: listing.name,
    identity: `${listing.exchange}:${listing.symbol} - ${listing.priceCurrency}`,
    dateLine: t("date", { date: dateText(now, locale) }),
    priceLine,
    keyTitle: t("keyTitle"),
    rows: keyRows(stock, locale, t),
    keyNone: t("keyNone"),
    yourTitle: t("yourTitle"),
    pick: {
      label: t("pick"),
      value: pick ? `${a.pickLabel(pick)} ${t("pickNote")}` : t("pickNone"),
    },
    notes: {
      label: t("notes"),
      value: plainText(entry?.note ?? "", 2000) || t("notesNone"),
    },
    estimate,
    ai,
    disclaimer: t("disclaimer"),
    footer: t("footer"),
  };
}
