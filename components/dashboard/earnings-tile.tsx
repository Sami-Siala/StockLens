"use client";

import { useTranslations } from "next-intl";
import type { QuotesResponse } from "@/lib/contract";
import type { PolledResource } from "@/lib/data/hooks";
import { Link } from "../navigation";
import { ExplainToggle } from "../stock/explain-toggle";
import { Skeleton } from "../ui/skeleton";
import { EarningsText } from "./earnings-chip";
import { selectEarnings, type EarningsItem } from "./quote-format";
import { Tile, TileMessage } from "./tile";

export interface EarningsCompany {
  symbol: string;
  name: string;
  exchange: string;
}

function EarningsList({ items, now }: { items: EarningsItem[]; now: Date }) {
  return (
    <ul className="flex flex-col gap-4">
      {items.map((it) => (
        <li key={it.symbol}>
          <Link
            href={`/stock/${encodeURIComponent(it.symbol)}`}
            className="-mx-2 flex items-center justify-between gap-4 rounded-xl px-2 py-1 hover:bg-background"
          >
            <span className="min-w-0">
              <span className="block truncate">{it.name}</span>
              <span className="block truncate text-sm text-muted">
                {it.exchange ? `${it.exchange}:` : ""}
                {it.symbol}
              </span>
            </span>
            <span className="shrink-0 text-right text-sm">
              <EarningsText earnings={it.earnings} now={now} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Tile 7. `companies` is the curated list plus the watchlist, already de-duplicated. */
export function EarningsView({
  companies,
  quotes,
  retry,
}: {
  companies: EarningsCompany[];
  quotes: PolledResource<QuotesResponse>;
  retry: () => void;
}) {
  const t = useTranslations("Dash.earnings");
  if (quotes.status === "loading")
    return (
      <div
        role="status"
        aria-label={t("loading")}
        className="flex flex-col gap-3"
      >
        <Skeleton className="h-10 w-full bg-background" />
        <Skeleton className="h-10 w-full bg-background" />
      </div>
    );
  if (quotes.status === "error")
    return <TileMessage onRetry={retry}>{t("error")}</TileMessage>;

  const now = new Date(quotes.refreshedAt);
  const { thisWeek, upcoming } = selectEarnings(
    companies.map((c) => {
      const entry = quotes.data.entries.find((e) => e.symbol === c.symbol);
      return {
        ...c,
        earnings: entry?.quote.value?.nextEarnings.value ?? null,
      };
    }),
    now,
  );

  return (
    <div className="flex flex-col gap-4">
      {thisWeek.length > 0 ? (
        <EarningsList items={thisWeek} now={now} />
      ) : upcoming.length > 0 ? (
        <>
          <p className="text-sm text-muted">{t("nothingThisWeek")}</p>
          <EarningsList items={upcoming} now={now} />
        </>
      ) : (
        <p className="text-sm text-muted">{t("noDates")}</p>
      )}
      <div>
        <ExplainToggle id="eps" />
      </div>
    </div>
  );
}

export function EarningsTile({
  companies,
  quotes,
  retry,
  className,
}: {
  companies: EarningsCompany[];
  quotes: PolledResource<QuotesResponse>;
  retry: () => void;
  className?: string;
}) {
  const t = useTranslations("Dash.earnings");
  return (
    <Tile
      id="earnings"
      title={t("title")}
      hint={t("hint")}
      className={className}
    >
      <EarningsView companies={companies} quotes={quotes} retry={retry} />
    </Tile>
  );
}
