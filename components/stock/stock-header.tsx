import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { StockSnapshot } from "@/lib/contract";
import { cn } from "@/lib/utils";
import {
  formatExchangeTime,
  formatNumber,
  formatPercent,
  isNum,
} from "../format";
import { fromMetric } from "./metrics";

function Chip({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="rounded-full bg-surface px-2 py-1 text-xs text-muted"
    >
      {children}
    </span>
  );
}

export function StockHeader({ stock }: { stock: StockSnapshot }) {
  const t = useTranslations("Stock");
  const locale = useLocale();
  const { listing } = stock;
  const q = fromMetric(stock.quote);
  const quote = q.ok ? q.value : null;

  const change = quote && isNum(quote.change) ? quote.change : null;
  const pct = quote && isNum(quote.changePercent) ? quote.changePercent : null;
  const direction =
    (change ?? pct ?? 0) > 0
      ? "up"
      : (change ?? pct ?? 0) < 0
        ? "down"
        : "flat";
  const Arrow =
    direction === "up" ? ArrowUp : direction === "down" ? ArrowDown : Minus;

  const delay = quote?.delayMinutes;
  const state = quote?.marketState ?? "UNKNOWN";
  const asOf = quote
    ? formatExchangeTime(quote.asOf, listing.exchangeTimezone, locale)
    : "";

  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{listing.name}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span title={t("tickerHint")}>
            {listing.exchange}:{listing.symbol}
          </span>
          <Chip
            title={listing.priceCurrency === "GBp" ? t("penceHint") : undefined}
          >
            {listing.priceCurrency}
          </Chip>
          {listing.quoteType !== "EQUITY" && (
            <Chip>{t(`type.${listing.quoteType}`)}</Chip>
          )}
        </div>
      </div>

      {quote ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="text-4xl">
              <span className="sr-only">{t("priceLabel")} </span>
              {formatNumber(quote.price.amount, locale, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              <span className="text-lg text-muted">{quote.price.currency}</span>
            </p>
            {(change !== null || pct !== null) && (
              <p
                className={cn(
                  "flex items-center gap-1 text-lg",
                  direction === "up" && "text-positive",
                  direction === "down" && "text-negative",
                  direction === "flat" && "text-muted",
                )}
              >
                <Arrow aria-hidden="true" className="size-5" />
                <span className="sr-only">{t(`direction.${direction}`)}</span>
                {change !== null && (
                  <span>
                    {formatNumber(change, locale, {
                      signDisplay: "exceptZero",
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                )}
                {pct !== null && (
                  <span>
                    {change !== null ? "(" : ""}
                    {formatPercent(pct, locale, { signed: true, digits: 2 })}
                    {change !== null ? ")" : ""}
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            {isNum(delay) && delay > 0 ? (
              <Chip>{t("delayed", { minutes: delay })}</Chip>
            ) : delay === 0 ? (
              <Chip>{t("realtime")}</Chip>
            ) : (
              <Chip>{t("maybeDelayed")}</Chip>
            )}
            {state !== "UNKNOWN" && <span>{t(`market.${state}`)}</span>}
            {asOf && <span>{t("asOf", { time: asOf })}</span>}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">
          {t("priceUnavailable")} {!q.ok && t(`reasons.${q.reason}`)}
        </p>
      )}
    </header>
  );
}
