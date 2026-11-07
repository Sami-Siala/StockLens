"use client";

import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { stockHref } from "@/lib/education/class-link";
import { Link } from "../navigation";
import { Skeleton } from "../ui/skeleton";
import { Change } from "./change";
import { changeParts, priceParts, sparklineOf } from "./quote-format";
import type { RowState } from "./row-state";
import { Sparkline } from "./sparkline";

export interface RowCompany {
  symbol: string;
  name: string;
  exchange: string;
}

/** "Delayed 15 min" / "Real time" / "May be delayed", or the saved-copy note when stale. */
export function FreshnessNote({
  minutes,
  stale,
}: {
  minutes: number | null;
  stale: boolean;
}) {
  const t = useTranslations("Dash");
  if (stale) return <>{t("stale")}</>;
  if (minutes === null) return <>{t("maybeDelayed")}</>;
  if (minutes > 0) return <>{t("delayed", { minutes })}</>;
  return <>{t("realtime")}</>;
}

/**
 * One company: name and `EXCHANGE:SYMBOL` on the left, price and day change on the right, a small
 * trend line between. `note` is a sentence about the company; `footnote` is the quiet last line
 * (delay, report date).
 */
export function QuoteRow({
  company,
  state,
  note,
  footnote,
  action,
  hideAi = false,
}: {
  company: RowCompany;
  state: RowState;
  /** A sentence about the company (the "why" of a starter). */
  note?: ReactNode;
  footnote?: ReactNode;
  action?: ReactNode;
  /** A class link asked for the AI to stay hidden: the company page opens with `?hideAI=1`. */
  hideAi?: boolean;
}) {
  const t = useTranslations("Dash");
  const locale = useLocale();
  const quote = state.kind === "ok" ? state.quote : null;
  const price = quote ? priceParts(quote, locale) : null;
  const change = quote ? changeParts(quote, locale) : null;
  const spark = quote ? sparklineOf(quote) : null;
  const exchange = company.exchange || quote?.exchange || "";

  return (
    <li className="flex items-center gap-2">
      <Link
        href={stockHref(company.symbol, hideAi)}
        className="-mx-2 flex min-w-0 flex-1 flex-col gap-1 rounded-xl px-2 py-1 hover:bg-background"
      >
        <span className="flex items-center gap-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate">{company.name}</span>
            <span className="block truncate text-sm text-muted">
              {exchange ? `${exchange}:` : ""}
              {company.symbol}
            </span>
          </span>
          {spark && <Sparkline values={spark} />}
          <span className="flex min-w-20 flex-col items-end text-right">
            {state.kind === "loading" && (
              <>
                <Skeleton className="h-5 w-16" />
                <Skeleton className="mt-1 h-4 w-12" />
              </>
            )}
            {state.kind === "missing" && (
              <span className="text-sm text-muted">
                {t(
                  state.reason === "not_found"
                    ? "notFound"
                    : "priceUnavailable",
                )}
              </span>
            )}
            {price && (
              <span>
                {price.amount}
                {price.unit && (
                  <span className="text-sm text-muted"> {price.unit}</span>
                )}
              </span>
            )}
            {change && <Change change={change} />}
          </span>
        </span>
        {note && <span className="block text-sm text-muted">{note}</span>}
        {(quote || footnote) && (
          <span className="block text-xs text-muted">
            {quote && state.kind === "ok" && (
              <FreshnessNote minutes={quote.delayMinutes} stale={state.stale} />
            )}
            {quote && footnote && " · "}
            {footnote}
          </span>
        )}
      </Link>
      {action}
    </li>
  );
}
