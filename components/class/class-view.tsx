"use client";

import { Info, ListChecks } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import type { QuotesResponse } from "@/lib/contract";
import { useQuotes, type PolledResource } from "@/lib/data/hooks";
import { rememberClassLink } from "@/lib/data/local/class-link";
import {
  CLASS_MAX_TICKERS,
  parseClassLink,
  type ParsedClassLink,
} from "@/lib/education/class-link";
import { QuoteRow } from "../dashboard/quote-row";
import { rowState } from "../dashboard/row-state";
import { TileMessage } from "../dashboard/tile";
import { CardBoundary } from "../stock/card-boundary";
import { Skeleton } from "../ui/skeleton";
import { ClassBuilder } from "./class-builder";
import { useSearchString } from "./use-search-string";

const CARD = "rounded-2xl bg-surface p-4 sm:p-6";

function ClassCard({
  symbol,
  quotes,
  hideAi,
}: {
  symbol: string;
  quotes: PolledResource<QuotesResponse>;
  hideAi: boolean;
}) {
  const t = useTranslations("Class");
  const state = rowState(symbol, quotes);
  // The quote carries the company name; until then (or when it fails) the symbol stands in.
  const name = state.kind === "ok" ? state.quote.name : symbol;
  return (
    <CardBoundary
      fallback={
        <p className={`${CARD} text-sm text-muted`}>{t("cardError")}</p>
      }
    >
      <ul className={CARD}>
        <QuoteRow
          company={{ symbol, name, exchange: "" }}
          state={state}
          hideAi={hideAi}
        />
      </ul>
    </CardBoundary>
  );
}

/** The list a class link carries: one card per company, each failing alone. */
export function ClassList({
  link,
  quotes,
  retry,
}: {
  link: ParsedClassLink;
  quotes: PolledResource<QuotesResponse>;
  retry: () => void;
}) {
  const t = useTranslations("Class");
  const { invalid, overflow } = link.issues;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        {t("count", { count: link.tickers.length })}
      </p>
      {quotes.status === "error" && (
        <TileMessage onRetry={retry}>{t("pricesError")}</TileMessage>
      )}
      {link.tickers.map((symbol) => (
        <ClassCard
          key={symbol}
          symbol={symbol}
          quotes={quotes}
          hideAi={link.hideAi}
        />
      ))}
      {invalid.length > 0 && (
        <p className="text-sm text-muted">
          {t("ignored", { list: invalid.join(", ") })}
        </p>
      )}
      {overflow > 0 && (
        <p className="text-sm text-muted">
          {t("overflow", { max: CLASS_MAX_TICKERS, count: overflow })}
        </p>
      )}
    </div>
  );
}

export function ClassEmpty({ link }: { link: ParsedClassLink }) {
  const t = useTranslations("Class");
  return (
    <div role="status" className={`${CARD} flex items-start gap-3`}>
      <ListChecks
        aria-hidden="true"
        className="mt-1 size-5 shrink-0 text-muted"
      />
      <div className="flex flex-col gap-1">
        <p className="font-medium">{t("emptyTitle")}</p>
        <p className="text-sm text-muted">
          {link.issues.invalid.length > 0 ? t("emptyInvalid") : t("emptyNone")}
        </p>
      </div>
    </div>
  );
}

function ClassSkeleton() {
  const t = useTranslations("Class");
  return (
    <div
      role="status"
      aria-label={t("loading")}
      className="flex flex-col gap-3 py-4"
    >
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

/** Title, intro and notes of a class page (the part that depends only on the link). */
export function ClassHeader({ link }: { link: ParsedClassLink }) {
  const t = useTranslations("Class");
  const empty = link.tickers.length === 0;
  return (
    <header className="flex flex-col gap-2">
      {/* Plain text: React escapes it, and it was cleaned and clipped when the link was read. */}
      <h1 className="text-2xl font-semibold break-words">
        {link.title || t("title")}
      </h1>
      {!empty && <p className="text-muted">{t("intro")}</p>}
      {link.hideAi && !empty && (
        <p role="note" className="flex items-start gap-2 text-sm text-muted">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t("hideAiNote")}
        </p>
      )}
    </header>
  );
}

/** Body of the class page once the link is known. */
export function ClassContent({ link }: { link: ParsedClassLink }) {
  const t = useTranslations("Class");
  const empty = link.tickers.length === 0;
  const [quotes, retry] = useQuotes(link.tickers);

  // Remember the list for home tile 10. Only a link that actually holds companies is kept.
  useEffect(() => {
    if (link.tickers.length > 0) rememberClassLink(link);
  }, [link]);

  return (
    <div className="flex flex-col gap-6 py-4">
      <ClassHeader link={link} />
      {empty ? (
        <ClassEmpty link={link} />
      ) : (
        <ClassList link={link} quotes={quotes} retry={retry} />
      )}
      <details open={empty} className={CARD}>
        <summary className="cursor-pointer font-medium">
          {t("builder.title")}
        </summary>
        <div className="mt-4">
          <ClassBuilder initial={link} />
        </div>
      </details>
    </div>
  );
}

export function ClassView() {
  const search = useSearchString();
  const link = useMemo(
    () => (search === null ? null : parseClassLink(search)),
    [search],
  );
  if (!link) return <ClassSkeleton />;
  return <ClassContent link={link} />;
}
