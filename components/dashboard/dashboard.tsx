"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { unionSymbols } from "@/lib/data/dashboard";
import { useMarket, useQuotes } from "@/lib/data/hooks";
import { useHydrated } from "@/lib/data/local/store";
import { useRecents, useWatchlist } from "@/lib/data/local/lists";
import { START_HERE } from "@/lib/education/start-here";
import { cn } from "@/lib/utils";
import { EarningsTile } from "./earnings-tile";
import { MarketsTile } from "./markets-tile";
import { RecentTile } from "./recent-tile";
import { StartHereTile } from "./start-here-tile";
import { AssignmentTile, LearnTile } from "./static-tiles";
import { WatchlistTile } from "./watchlist-tile";

/**
 * Home dashboard (PLAN §4.3). Data comes from exactly two calls: one /api/market and ONE batched
 * /api/quotes for the union of watchlist + starters + recents. Each tile gets its own state, so a
 * failing tile degrades alone.
 */
export function Dashboard() {
  const t = useTranslations("Dash");
  const locale = useLocale();
  const watch = useWatchlist();
  const recents = useRecents();
  const hydrated = useHydrated();

  const symbols = useMemo(
    () => unionSymbols(watch, START_HERE, recents),
    [watch, recents],
  );
  // Wait for the local lists, otherwise the first call would miss them and a second would follow.
  const [quotes, retryQuotes, refreshQuotes] = useQuotes(symbols, hydrated);
  const [market, retryMarket, refreshMarket] = useMarket();

  const earningsCompanies = useMemo(() => {
    const seen = new Set<string>();
    return [...watch, ...START_HERE].filter((c) => {
      if (seen.has(c.symbol)) return false;
      seen.add(c.symbol);
      return true;
    });
  }, [watch]);

  // A new visitor reads "Start here" before an empty watchlist (phones stack in DOM order).
  const watchEmpty = watch.length === 0;

  const updatedAt = Math.max(
    quotes.status === "ready" ? quotes.refreshedAt : 0,
    market.status === "ready" ? market.refreshedAt : 0,
  );
  const updated = updatedAt
    ? new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(updatedAt))
    : null;

  return (
    <div className="flex flex-col gap-4">
      {/*
        Phone: one column in DOM order (the `contents` wrappers vanish, `order` re-sequences).
        Desktop: 3 columns; the wide column holds the lists, the narrow one the glanceable tiles,
        each stacking independently so no tile is stretched to a neighbour's height.
      */}
      <div className="grid gap-4 lg:grid-cols-3 lg:items-start lg:gap-6">
        <MarketsTile
          market={market}
          retry={retryMarket}
          className="order-1 lg:order-none lg:col-span-3"
        />
        <div className="contents lg:col-span-2 lg:flex lg:flex-col lg:gap-6">
          <WatchlistTile
            items={watch}
            quotes={quotes}
            retry={retryQuotes}
            className={cn(watchEmpty ? "order-3" : "order-2", "lg:order-none")}
          />
          <StartHereTile
            companies={START_HERE}
            quotes={quotes}
            className={cn(watchEmpty ? "order-2" : "order-3", "lg:order-none")}
          />
        </div>
        <div className="contents lg:flex lg:flex-col lg:gap-6">
          <RecentTile
            items={recents}
            quotes={quotes}
            className="order-4 lg:order-none"
          />
          <EarningsTile
            companies={earningsCompanies}
            quotes={quotes}
            retry={retryQuotes}
            className="order-5 lg:order-none"
          />
          <LearnTile className="order-6 lg:order-none" />
          <AssignmentTile className="order-7 lg:order-none" />
        </div>
      </div>

      <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
        <span>
          {t("footer")}
          {updated && <> {t("updated", { time: updated })}</>}
        </span>
        <button
          type="button"
          onClick={() => {
            refreshQuotes();
            refreshMarket();
          }}
          className="rounded-full px-2 py-1 text-foreground underline underline-offset-4"
        >
          {t("refresh")}
        </button>
      </p>
    </div>
  );
}
