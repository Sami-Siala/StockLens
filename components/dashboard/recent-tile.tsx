"use client";

import { useTranslations } from "next-intl";
import type { QuotesResponse } from "@/lib/contract";
import type { PolledResource } from "@/lib/data/hooks";
import type { SavedCompany } from "@/lib/data/local/lists";
import { QuoteRow } from "./quote-row";
import { rowState } from "./row-state";
import { Tile } from "./tile";

export function RecentView({
  items,
  quotes,
}: {
  items: SavedCompany[];
  quotes: PolledResource<QuotesResponse>;
}) {
  const t = useTranslations("Dash.recent");
  if (items.length === 0)
    return <p className="text-sm text-muted">{t("empty")}</p>;
  return (
    <ul className="flex flex-col gap-4">
      {items.map((c) => (
        <QuoteRow
          key={c.symbol}
          company={c}
          state={rowState(c.symbol, quotes)}
        />
      ))}
    </ul>
  );
}

export function RecentTile({
  items,
  quotes,
  className,
}: {
  items: SavedCompany[];
  quotes: PolledResource<QuotesResponse>;
  className?: string;
}) {
  const t = useTranslations("Dash.recent");
  return (
    <Tile id="recent" title={t("title")} hint={t("hint")} className={className}>
      <RecentView items={items} quotes={quotes} />
    </Tile>
  );
}
