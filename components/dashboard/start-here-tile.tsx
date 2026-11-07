"use client";

import { useLocale, useTranslations } from "next-intl";
import type { QuotesResponse } from "@/lib/contract";
import type { PolledResource } from "@/lib/data/hooks";
import { SHOWN_FIRST, type StartHereCompany } from "@/lib/education/start-here";
import { QuoteRow } from "./quote-row";
import { rowState } from "./row-state";
import { Tile } from "./tile";

/**
 * Curated starters. Names and the "why" line are static, so this tile is complete even when the
 * quotes are slow or down: it is the one that carries the page for a first-time visitor.
 */
export function StartHereView({
  companies,
  quotes,
}: {
  companies: readonly StartHereCompany[];
  quotes: PolledResource<QuotesResponse>;
}) {
  const locale = useLocale();
  const t = useTranslations("Dash.start");
  const lang = locale === "fr" ? "fr" : "en";
  const row = (c: StartHereCompany) => (
    <QuoteRow
      key={c.symbol}
      company={c}
      state={rowState(c.symbol, quotes)}
      note={c.why[lang]}
    />
  );
  const first = companies.slice(0, SHOWN_FIRST);
  const rest = companies.slice(SHOWN_FIRST);
  return (
    <>
      <ul className="flex flex-col gap-4">{first.map(row)}</ul>
      {rest.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-link">
            {t("more", { count: rest.length })}
          </summary>
          <ul className="mt-4 flex flex-col gap-4">{rest.map(row)}</ul>
        </details>
      )}
    </>
  );
}

export function StartHereTile({
  companies,
  quotes,
  className,
}: {
  companies: readonly StartHereCompany[];
  quotes: PolledResource<QuotesResponse>;
  className?: string;
}) {
  const t = useTranslations("Dash.start");
  return (
    <Tile id="start" title={t("title")} hint={t("hint")} className={className}>
      <StartHereView companies={companies} quotes={quotes} />
    </Tile>
  );
}
