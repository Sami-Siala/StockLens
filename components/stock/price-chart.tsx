"use client";

/**
 * TradingView Lightweight Charts wrapper. Loaded lazily (see chart-panel.tsx).
 * - `attributionLogo: true` shows the required TradingView attribution on the chart;
 *   the NOTICE text and tradingview.com link are on the About page.
 * - Lightweight Charts has no timezone support, so axis + crosshair labels use our own
 *   formatters with Intl in the exchange's timezone (candles stay in plain UTC seconds).
 */
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  TickMarkType,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useLocale } from "next-intl";
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { ChartSeries } from "@/lib/contract";
import { formatCandleTime, formatNumber, withAlpha } from "../format";

export type ChartKind = "area" | "candle";

const DARK = "(prefers-color-scheme: dark)";
function subscribeScheme(cb: () => void) {
  const mq = window.matchMedia(DARK);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

const cssVar = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
  fallback;

const INTRADAY = new Set(["1m", "5m", "15m", "1h"]);

export interface HoverPoint {
  time: number;
  close: number;
}

export default function PriceChart({
  series,
  kind,
  onHover,
}: {
  series: ChartSeries;
  kind: ChartKind;
  onHover: (point: HoverPoint | null) => void;
}) {
  const locale = useLocale();
  const ref = useRef<HTMLDivElement>(null);
  const dark = useSyncExternalStore(
    subscribeScheme,
    () => window.matchMedia(DARK).matches,
    () => false,
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || series.candles.length === 0) return;

    const tz = series.exchangeTimezone;
    const intraday = INTRADAY.has(series.interval);
    const muted = cssVar("--muted", dark ? "#98989d" : "#6e6e73");
    const border = cssVar("--border", dark ? "#2c2c2e" : "#e5e5ea");
    const positive = cssVar("--positive", "#1a7f37");
    const negative = cssVar("--negative", "#cf222e");
    const candles = series.candles;
    const up = candles[candles.length - 1].c >= candles[0].c;
    const line = up ? positive : negative;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: muted,
        fontFamily: getComputedStyle(document.body).fontFamily,
        // Required by the Lightweight Charts licence (link to tradingview.com).
        attributionLogo: true,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: border } },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        timeVisible: intraday,
        secondsVisible: false,
        tickMarkFormatter: (time: Time, type: TickMarkType) => {
          const t = time as number;
          if (
            type === TickMarkType.Time ||
            type === TickMarkType.TimeWithSeconds
          )
            return formatCandleTime(t, tz, locale, "time");
          return new Intl.DateTimeFormat(locale, {
            timeZone: tz,
            ...(type === TickMarkType.Year
              ? { year: "numeric" }
              : type === TickMarkType.Month
                ? { month: "short" }
                : { day: "numeric", month: "short" }),
          }).format(new Date(t * 1000));
        },
      },
      localization: {
        timeFormatter: (time: Time) =>
          formatCandleTime(
            time as number,
            tz,
            locale,
            intraday ? "datetime" : "date",
          ),
        priceFormatter: (p: number) =>
          formatNumber(p, locale, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
      },
      crosshair: { mode: 1 },
    });

    const priceFormat = { type: "price" as const, precision: 2, minMove: 0.01 };
    const api =
      kind === "candle"
        ? chart.addSeries(CandlestickSeries, {
            upColor: positive,
            downColor: negative,
            borderVisible: false,
            wickUpColor: positive,
            wickDownColor: negative,
            priceFormat,
          })
        : chart.addSeries(AreaSeries, {
            lineColor: line,
            topColor: withAlpha(line, 0.25),
            bottomColor: withAlpha(line, 0),
            lineWidth: 2,
            priceFormat,
          });

    if (kind === "candle") {
      (api as ReturnType<typeof chart.addSeries<"Candlestick">>).setData(
        candles.map((c) => ({
          time: c.t as UTCTimestamp,
          open: c.o,
          high: c.h,
          low: c.l,
          close: c.c,
        })),
      );
    } else {
      (api as ReturnType<typeof chart.addSeries<"Area">>).setData(
        candles.map((c) => ({ time: c.t as UTCTimestamp, value: c.c })),
      );
    }
    chart.timeScale().fitContent();

    const onMove = (param: MouseEventParams<Time>) => {
      const d = param.seriesData.get(api) as
        { value?: number; close?: number } | undefined;
      const close = d?.close ?? d?.value;
      if (param.time === undefined || close === undefined) return onHover(null);
      onHover({ time: param.time as number, close });
    };
    chart.subscribeCrosshairMove(onMove);

    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
    };
  }, [series, kind, locale, dark, onHover]);

  return <div ref={ref} className="h-full w-full" />;
}
