"use client";

import { useLocale, useTranslations } from "next-intl";
import type { QuotesResponse } from "@/lib/contract";
import type { PolledResource } from "@/lib/data/hooks";
import type { StartHereCompany } from "@/lib/education/start-here";
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
  const lang = locale === "fr" ? "fr" : "en";
  return (
    <ul className="flex flex-col gap-4">
      {companies.map((c) => (
        <QuoteRow
          key={c.symbol}
          company={c}
          state={rowState(c.symbol, quotes)}
          note={c.why[lang]}
        />
      ))}
    </ul>
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
