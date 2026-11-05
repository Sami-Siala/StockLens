"use client";

import { Clock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TickerResponse } from "@/lib/contract";
import { tickerItems } from "@/lib/data/ticker";
import { useTicker, type PolledResource } from "@/lib/data/hooks";
import { cn } from "@/lib/utils";
import { Change } from "../dashboard/change";
import {
  copiesNeeded,
  loopDuration,
  stableDuration,
  tickerRows,
  type TickerRow,
} from "./ticker-format";

/** The entrance eases in once per page load; later pages mount the band already in place. */
let entranceDone = false;

function Item({ row }: { row: TickerRow }) {
  const t = useTranslations("Ticker");
  const label = t.has(`items.${row.id}`) ? t(`items.${row.id}`) : row.label;
  return (
    <li
      className="ticker-item text-xs"
      data-region-start={row.regionStart ? "" : undefined}
    >
      <span className="text-muted">{label}</span>
      <span>
        {row.level}
        {row.unit && <span className="text-muted"> {row.unit}</span>}
      </span>
      {row.change && <Change change={row.change} compact className="text-xs" />}
      {row.stale && (
        <span className="inline-flex text-muted" title={t("stale")}>
          <Clock aria-hidden="true" className="size-3" />
          <span className="sr-only">{t("stale")}</span>
        </span>
      )}
    </li>
  );
}

function Strip({ rows }: { rows: TickerRow[] }) {
  const t = useTranslations("Ticker");
  const ref = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [anim, setAnim] = useState<{ copies: number; duration: number | null }>(
    { copies: 2, duration: null },
  );
  const [animate] = useState(() => !entranceDone);

  useEffect(() => {
    entranceDone = true;
  }, []);

  // Measure one list: the duration follows its width (constant px/s) and enough copies are drawn
  // to fill the window. The observer's callback runs after layout, never synchronously in render.
  useEffect(() => {
    const viewport = viewportRef.current;
    const list = listRef.current;
    if (!viewport || !list || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const width = list.getBoundingClientRect().width;
      if (!(width > 0)) return;
      const copies = copiesNeeded(viewport.clientWidth, width);
      setAnim((prev) => {
        const duration = stableDuration(prev.duration, loopDuration(width));
        return prev.copies === copies && prev.duration === duration
          ? prev
          : { copies, duration };
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  // A hidden tab pauses the animation (the browser throttles it anyway; this keeps it exact).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () => {
      if (document.hidden) el.dataset.hidden = "";
      else delete el.dataset.hidden;
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  // A finger held on the band pauses it (CSS :active is unreliable on iOS).
  const press = (on: boolean) => (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" || !ref.current) return;
    if (on) ref.current.dataset.pressed = "";
    else delete ref.current.dataset.pressed;
  };

  return (
    <section
      ref={ref}
      aria-label={t("label")}
      tabIndex={0}
      onPointerDown={press(true)}
      onPointerUp={press(false)}
      onPointerCancel={press(false)}
      onPointerLeave={press(false)}
      className={cn("ticker border-b border-border", animate && "ticker-enter")}
    >
      <p className="sr-only">{t("note")}</p>
      <div ref={viewportRef} className="ticker-viewport">
        <div
          className="ticker-track h-8 items-center"
          data-ready={anim.duration !== null ? "" : undefined}
          style={
            {
              "--ticker-copies": anim.copies,
              "--ticker-duration": `${anim.duration ?? 0}s`,
            } as React.CSSProperties
          }
        >
          {Array.from({ length: anim.copies }, (_, copy) => (
            <ul
              key={copy}
              ref={copy === 0 ? listRef : undefined}
              role="list"
              aria-hidden={copy > 0 ? true : undefined}
              className="ticker-list"
            >
              {rows.map((row) => (
                <Item key={row.id} row={row} />
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Pure view: renders nothing (no band, no error, no reserved height) unless there is enough to show. */
export function TickerBandView({
  ticker,
}: {
  ticker: PolledResource<TickerResponse>;
}) {
  const locale = useLocale();
  const data = ticker.status === "ready" ? ticker.data : null;
  const rows = useMemo(
    () => tickerRows(tickerItems(data), locale),
    [data, locale],
  );
  if (rows.length === 0) return null;
  return <Strip rows={rows} />;
}

/** The slim market band under the header, on every page. One shared /api/ticker request. */
export function TickerBand() {
  return <TickerBandView ticker={useTicker()} />;
}
