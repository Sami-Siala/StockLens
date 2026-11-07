"use client";

import {
  ArrowDown,
  ArrowUp,
  ChartCandlestick,
  ChartLine,
  RefreshCw,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import type { ChartRange, Listing } from "@/lib/contract";
import { useChart } from "@/lib/data/hooks";
import { cn } from "@/lib/utils";
import { formatCandleTime, formatMoney, formatPercent, isNum } from "../format";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import type { ChartKind, HoverPoint } from "./price-chart";
import { summarizeCandles } from "./metrics";

// Lazy: the charting library only loads when a chart is on screen, and never on the server.
const PriceChart = dynamic(() => import("./price-chart"), {
  ssr: false,
  loading: () => <Skeleton className="size-full" />,
});

export const RANGES: ChartRange[] = [
  "1H",
  "1D",
  "1W",
  "1M",
  "1Y",
  "3Y",
  "5Y",
  "ALL",
];
const INTRADAY_INTERVALS = new Set(["1m", "5m", "15m", "1h"]);

export function ChartPanel({ listing }: { listing: Listing }) {
  const t = useTranslations("Stock.chart");
  const reasons = useTranslations("Stock.reasons");
  const locale = useLocale();
  const [range, setRange] = useState<ChartRange>("1Y");
  const [kind, setKind] = useState<ChartKind>("area");
  const [hover, setHover] = useState<HoverPoint | null>(null);
  const [res, retry] = useChart(listing.symbol, range);
  const onHover = useCallback((p: HoverPoint | null) => setHover(p), []);

  const series = res.status === "ready" ? res.data.series : null;
  const data = series?.value ?? null;
  const summary = data ? summarizeCandles(data.candles) : null;
  const currency = data?.currency ?? listing.priceCurrency;

  let summaryText = "";
  if (summary) {
    summaryText = t("summary", {
      range: t(`rangeName.${range}`),
      from: formatMoney(summary.first, currency, locale),
      to: formatMoney(summary.last, currency, locale),
      high: formatMoney(summary.high, currency, locale),
      low: formatMoney(summary.low, currency, locale),
    });
  }

  const up = (summary?.change ?? 0) >= 0;
  const Arrow = up ? ArrowUp : ArrowDown;

  return (
    <section aria-labelledby="chart-title" className="flex flex-col gap-3">
      <h2 id="chart-title" className="sr-only">
        {t("title")}
      </h2>

      <div className="flex items-center justify-between gap-3">
        <div
          role="group"
          aria-label={t("rangeLabel")}
          className="grid flex-1 grid-cols-8 gap-1 sm:max-w-md"
        >
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={r === range}
              aria-label={`${t(`range.${r}`)}, ${t(`rangeName.${r}`)}`}
              onClick={() => {
                setRange(r);
                setHover(null);
              }}
              className={cn(
                "h-10 rounded-full text-sm",
                r === range
                  ? "bg-accent-fill text-on-accent"
                  : "text-muted hover:text-foreground",
              )}
            >
              {t(`range.${r}`)}
            </button>
          ))}
        </div>
        <div role="group" aria-label={t("kindLabel")} className="flex gap-1">
          {(["area", "candle"] as const).map((k) => {
            const Icon = k === "area" ? ChartLine : ChartCandlestick;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={k === kind}
                aria-label={t(`kind.${k}`)}
                title={t(`kind.${k}`)}
                onClick={() => setKind(k)}
                className={cn(
                  "inline-flex size-10 items-center justify-center rounded-full",
                  k === kind
                    ? "bg-surface text-foreground"
                    : "text-muted hover:text-foreground",
                )}
              >
                <Icon aria-hidden="true" className="size-5" />
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="img"
        aria-label={summaryText || t("title")}
        className="h-64 w-full md:h-96"
      >
        {res.status === "loading" && <Skeleton className="size-full" />}
        {res.status === "error" && (
          <div className="flex size-full flex-col items-center justify-center gap-3 rounded-2xl bg-surface p-4 text-center">
            <p className="text-sm text-muted">{t("error")}</p>
            <Button variant="secondary" size="sm" onClick={retry}>
              <RefreshCw aria-hidden="true" className="size-4" />
              {t("retry")}
            </Button>
          </div>
        )}
        {series && !data && (
          <div className="flex size-full items-center justify-center rounded-2xl bg-surface p-4 text-center">
            <p className="text-sm text-muted">
              {t("unavailable")}{" "}
              {reasons(series.reason ?? "not_provided_by_source")}
            </p>
          </div>
        )}
        {data && data.candles.length > 1 && (
          <PriceChart series={data} kind={kind} onHover={onHover} />
        )}
        {data && data.candles.length <= 1 && (
          <div className="flex size-full items-center justify-center rounded-2xl bg-surface p-4 text-center">
            <p className="text-sm text-muted">{t("noBars")}</p>
          </div>
        )}
      </div>

      <div
        className="flex min-h-10 flex-col gap-1 text-sm text-muted"
        aria-live="polite"
      >
        {data?.fallback && (
          <p>
            {t(
              data.fallback === "last_trading_hour"
                ? "fallbackHour"
                : "fallbackDay",
            )}
          </p>
        )}
        {hover && data ? (
          <p>
            {formatCandleTime(
              hover.time,
              data.exchangeTimezone,
              locale,
              INTRADAY_INTERVALS.has(data.interval) ? "datetime" : "date",
            )}
            {" · "}
            {formatMoney(hover.close, currency, locale)}
          </p>
        ) : (
          summary && (
            <p className="flex flex-wrap items-center gap-x-2">
              <span
                className={cn(
                  "flex items-center gap-1",
                  up ? "text-positive" : "text-negative",
                )}
              >
                <Arrow aria-hidden="true" className="size-4" />
                {summary.changePercent !== null && isNum(summary.changePercent)
                  ? formatPercent(summary.changePercent, locale, {
                      signed: true,
                    })
                  : formatMoney(summary.change, currency, locale)}
              </span>
              <span>{t("overRange", { range: t(`rangeName.${range}`) })}</span>
              <span>
                {t("highLow", {
                  high: formatMoney(summary.high, currency, locale),
                  low: formatMoney(summary.low, currency, locale),
                })}
              </span>
            </p>
          )
        )}
      </div>
    </section>
  );
}
