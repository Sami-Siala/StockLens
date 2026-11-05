"use client";

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import type { QuotesResponse } from "@/lib/contract";
import type { PolledResource } from "@/lib/data/hooks";
import type { SavedCompany } from "@/lib/data/local/lists";
import { WatchStar } from "../watchlist/watch-star";
import { EarningsText } from "./earnings-chip";
import { TileMessage, Tile } from "./tile";
import { QuoteRow } from "./quote-row";
import { rowState } from "./row-state";

export function WatchlistView({
  items,
  quotes,
  retry,
}: {
  items: SavedCompany[];
  quotes: PolledResource<QuotesResponse>;
  retry: () => void;
}) {
  const t = useTranslations("Dash.watchlist");
  if (items.length === 0)
    return (
      <div className="flex items-start gap-3 text-sm">
        <Star aria-hidden="true" className="mt-1 size-5 shrink-0 text-muted" />
        <div className="flex flex-col gap-1">
          <p>{t("empty")}</p>
          <p className="text-muted">{t("emptyHint")}</p>
        </div>
      </div>
    );
  const now = new Date(quotes.status === "ready" ? quotes.refreshedAt : 0);
  return (
    <div className="flex flex-col gap-4">
      {quotes.status === "error" && (
        <TileMessage onRetry={retry}>{t("error")}</TileMessage>
      )}
      <ul className="flex flex-col gap-4">
        {items.map((c) => {
          const state = rowState(c.symbol, quotes);
          const earnings =
            state.kind === "ok" ? state.quote.nextEarnings.value : null;
          return (
            <QuoteRow
              key={c.symbol}
              company={c}
              state={state}
              footnote={
                earnings && <EarningsText earnings={earnings} now={now} />
              }
              action={<WatchStar company={c} />}
            />
          );
        })}
      </ul>
    </div>
  );
}

export function WatchlistTile({
  items,
  quotes,
  retry,
  className,
}: {
  items: SavedCompany[];
  quotes: PolledResource<QuotesResponse>;
  retry: () => void;
  className?: string;
}) {
  const t = useTranslations("Dash.watchlist");
  return (
    <Tile
      id="watchlist"
      title={t("title")}
      hint={t("hint")}
      className={className}
    >
      <WatchlistView items={items} quotes={quotes} retry={retry} />
    </Tile>
  );
}
