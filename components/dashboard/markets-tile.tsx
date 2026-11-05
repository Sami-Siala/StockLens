"use client";

import { useLocale, useTranslations } from "next-intl";
import type {
  MarketIndexItem,
  MarketResponse,
  MarketStatus,
} from "@/lib/contract";
import type { PolledResource } from "@/lib/data/hooks";
import { cn } from "@/lib/utils";
import { Skeleton } from "../ui/skeleton";
import { Change } from "./change";
import { FreshnessNote } from "./quote-row";
import {
  changeParts,
  INDEX_KEYS,
  priceParts,
  sparklineOf,
} from "./quote-format";
import { Sparkline } from "./sparkline";
import { Tile, TileMessage } from "./tile";

function StatusChip({ status }: { status: MarketStatus }) {
  const t = useTranslations("Dash.markets");
  const open = status.isOpen;
  return (
    <li className="inline-flex items-center gap-2 rounded-full bg-background px-3 py-1 text-sm">
      <span
        aria-hidden="true"
        className={cn("size-2 rounded-full", open ? "bg-positive" : "bg-muted")}
      />
      <span>{t(`names.${status.id}`)}</span>
      <span className="text-muted">{t(`state.${status.marketState}`)}</span>
    </li>
  );
}

function IndexCell({ item }: { item: MarketIndexItem }) {
  const t = useTranslations("Dash.markets");
  const locale = useLocale();
  const key = INDEX_KEYS[item.symbol];
  const label = key ? t(`index.${key}`) : item.label;
  const q = item.quote.value;
  const price = q ? priceParts(q, locale, item.kind) : null;
  const change = q ? changeParts(q, locale, item.kind) : null;
  const spark = q ? sparklineOf(q) : null;

  return (
    <li className="flex min-w-0 flex-col gap-1 rounded-xl bg-background p-3">
      <p className="flex items-start justify-between gap-2 text-sm text-muted">
        <span>{label}</span>
        {item.kind === "future" && (
          <span
            className="shrink-0 rounded-full bg-surface px-2 text-xs"
            title={t("kindHint.future")}
          >
            {t("kind.future")}
          </span>
        )}
      </p>
      {q && price ? (
        <>
          <div className="flex items-end justify-between gap-2">
            <div className="flex shrink-0 flex-col gap-1">
              <p className="whitespace-nowrap">
                {price.amount}
                {price.unit && (
                  <span className="text-sm text-muted"> {price.unit}</span>
                )}
              </p>
              {change && <Change change={change} />}
            </div>
            {spark && (
              <Sparkline values={spark} className="w-12 min-w-6 shrink" />
            )}
          </div>
          <p className="text-xs text-muted">
            <FreshnessNote minutes={q.delayMinutes} stale={item.stale} />
          </p>
        </>
      ) : (
        <p className="text-sm text-muted">{t("itemUnavailable")}</p>
      )}
    </li>
  );
}

export function MarketsSkeleton() {
  const t = useTranslations("Dash");
  return (
    <div
      role="status"
      aria-label={t("loading")}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-32 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl bg-background" />
        ))}
      </div>
    </div>
  );
}

export function MarketsView({
  market,
  retry,
}: {
  market: PolledResource<MarketResponse>;
  retry: () => void;
}) {
  const t = useTranslations("Dash.markets");
  if (market.status === "loading") return <MarketsSkeleton />;
  if (market.status === "error")
    return <TileMessage onRetry={retry}>{t("error")}</TileMessage>;
  const { status, indices } = market.data;
  const estimated = status.some((s) => s.basis === "schedule");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <ul className="flex flex-wrap gap-2" aria-label={t("statusLabel")}>
          {status.map((s) => (
            <StatusChip key={s.id} status={s} />
          ))}
        </ul>
        {estimated && <p className="text-xs text-muted">{t("scheduleNote")}</p>}
      </div>
      <ul
        aria-label={t("indicesLabel")}
        className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4"
      >
        {indices.map((item) => (
          <IndexCell key={item.symbol} item={item} />
        ))}
      </ul>
    </div>
  );
}

export function MarketsTile({
  market,
  retry,
  className,
}: {
  market: PolledResource<MarketResponse>;
  retry: () => void;
  className?: string;
}) {
  const t = useTranslations("Dash.markets");
  return (
    <Tile
      id="markets"
      title={t("title")}
      hint={t("hint")}
      className={className}
    >
      <MarketsView market={market} retry={retry} />
    </Tile>
  );
}
