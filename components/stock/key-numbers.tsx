import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { StockSnapshot } from "@/lib/contract";
import { cn } from "@/lib/utils";
import {
  formatMoney,
  formatMonthYear,
  formatNumber,
  formatPercent,
  isNum,
} from "../format";
import { CardBoundary } from "./card-boundary";
import { MetricCard } from "./metric-card";
import { epsVerdict, selectors, type LinePick } from "./metrics";

/** Big value + a quieter line under it. Tabular figures come from the body style. */
function Value({ children }: { children: ReactNode }) {
  return <p className="text-2xl">{children}</p>;
}

function Detail({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

function periodKey(p: Pick<LinePick, "length">) {
  return p.length === "3M" ? "quarter" : p.length === "6M" ? "half" : "year";
}

export function KeyNumbers({ stock }: { stock: StockSnapshot }) {
  const t = useTranslations("Stock");
  const locale = useLocale();
  const s = selectors(stock);
  const priceCurrency = stock.listing.priceCurrency;

  /** Card for a line item (revenue / operating profit / FCF) with period + currency labels. */
  function lineBody(
    pick: ReturnType<typeof selectors>["revenue"],
    extra: ReactNode,
  ): ReactNode | null {
    if (!pick.ok) return null;
    const p = pick.value;
    return (
      <>
        <Value>
          {formatMoney(p.value, p.currency, locale, { compact: true })}
        </Value>
        <Detail>
          {t(`period.${periodKey(p)}`, {
            date: formatMonthYear(p.periodEnd, locale),
          })}
        </Detail>
        {extra}
        {p.currency !== priceCurrency && (
          <Detail>
            {t("reportedIn", { currency: p.currency, price: priceCurrency })}
          </Detail>
        )}
      </>
    );
  }

  const eps = s.eps.ok ? s.eps.value : null;
  const verdict = eps ? epsVerdict(eps.difference, eps.surprise) : null;
  const VerdictIcon =
    verdict === "beat" ? TrendingUp : verdict === "miss" ? TrendingDown : Minus;

  const margin = s.operatingMargin.ok ? s.operatingMargin.value : null;
  const growth = s.revenueGrowth.ok ? s.revenueGrowth.value : null;
  const bothPeMissing = !s.trailingPE.ok && !s.forwardPE.ok;

  const peRow = (
    key: "trailing" | "forward",
    pick: typeof s.trailingPE,
  ): ReactNode => (
    <div className="flex items-baseline justify-between gap-4">
      <div>
        <p className="text-sm">{t(`pe.${key}`)}</p>
        <p className="text-sm text-muted">{t(`pe.${key}Hint`)}</p>
      </div>
      {pick.ok && isNum(pick.value) ? (
        <p className="text-2xl">
          {formatNumber(pick.value, locale, { maximumFractionDigits: 1 })}
        </p>
      ) : (
        <p className="max-w-40 text-right text-sm text-muted">
          {pick.ok ? t("na") : t(`reasons.${pick.reason}`)}
        </p>
      )}
    </div>
  );

  // A fund / ETF has no company statements: say it once instead of six identical cards.
  const fundsOnly =
    !s.fundamentals.ok && s.fundamentals.reason === "not_applicable_for_type";

  const failedCard = (
    <p className="rounded-2xl bg-surface p-4 text-sm text-muted">
      {t("cardError")}
    </p>
  );

  return (
    <section aria-labelledby="key-numbers" className="flex flex-col gap-3">
      <h2 id="key-numbers" className="text-lg font-semibold">
        {t("keyNumbers")}
      </h2>
      {fundsOnly ? (
        <p className="rounded-2xl bg-surface p-4 text-muted">
          {t("fundsNote")}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <CardBoundary fallback={failedCard}>
            <MetricCard
              id="eps"
              reason={!s.eps.ok ? s.eps.reason : undefined}
              body={
                eps && verdict ? (
                  <>
                    <Value>
                      {formatMoney(eps.epsActual, eps.currency, locale)}
                    </Value>
                    <Detail>
                      {t("eps.expected", {
                        value: formatMoney(
                          eps.epsEstimate,
                          eps.currency,
                          locale,
                        ),
                      })}
                    </Detail>
                    <p
                      className={cn(
                        "flex items-center gap-1 text-sm",
                        verdict === "beat" && "text-positive",
                        verdict === "miss" && "text-negative",
                        verdict === "inline" && "text-muted",
                      )}
                    >
                      <VerdictIcon aria-hidden="true" className="size-4" />
                      {t(`eps.${verdict}`, {
                        pct: isNum(eps.surprise)
                          ? formatPercent(Math.abs(eps.surprise), locale)
                          : "",
                      })}
                    </p>
                    <Detail>
                      {t("period.quarter", {
                        date: formatMonthYear(eps.quarterEnd, locale),
                      })}
                    </Detail>
                  </>
                ) : null
              }
            />
          </CardBoundary>

          <CardBoundary fallback={failedCard}>
            <MetricCard
              id="pe"
              reason={
                bothPeMissing
                  ? s.trailingPE.ok
                    ? undefined
                    : s.trailingPE.reason
                  : undefined
              }
              body={
                bothPeMissing ? null : (
                  <div className="flex flex-col gap-3">
                    {peRow("trailing", s.trailingPE)}
                    {peRow("forward", s.forwardPE)}
                  </div>
                )
              }
            />
          </CardBoundary>

          <CardBoundary fallback={failedCard}>
            <MetricCard
              id="revenue"
              reason={!s.revenue.ok ? s.revenue.reason : undefined}
              body={lineBody(
                s.revenue,
                growth !== null && isNum(growth) ? (
                  <Detail>
                    {t("revenue.growth", {
                      pct: formatPercent(growth, locale, { signed: true }),
                    })}
                  </Detail>
                ) : null,
              )}
            />
          </CardBoundary>

          <CardBoundary fallback={failedCard}>
            <MetricCard
              id="operating"
              reason={
                !s.operatingIncome.ok ? s.operatingIncome.reason : undefined
              }
              body={lineBody(
                s.operatingIncome,
                margin !== null && isNum(margin) ? (
                  <Detail>
                    {t("operating.margin", {
                      pct: formatPercent(margin, locale),
                    })}
                  </Detail>
                ) : null,
              )}
            />
          </CardBoundary>

          <CardBoundary fallback={failedCard}>
            <MetricCard
              id="fcf"
              reason={!s.freeCashFlow.ok ? s.freeCashFlow.reason : undefined}
              body={lineBody(s.freeCashFlow, null)}
            />
          </CardBoundary>

          <CardBoundary fallback={failedCard}>
            <MetricCard
              id="marketCap"
              reason={!s.marketCap.ok ? s.marketCap.reason : undefined}
              body={
                s.marketCap.ok ? (
                  <Value>
                    {formatMoney(
                      s.marketCap.value.amount,
                      s.marketCap.value.currency,
                      locale,
                      {
                        compact: true,
                      },
                    )}
                  </Value>
                ) : null
              }
            />
          </CardBoundary>
        </div>
      )}
    </section>
  );
}
