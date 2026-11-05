import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { StockSnapshot } from "@/lib/contract";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

export const SYMBOLS = ["AAPL", "MC.PA", "7203.T", "SPY", "TSM"] as const;
export const MESSAGES = { en, fr } as const;

export const loadStock = (symbol: string): StockSnapshot =>
  JSON.parse(
    readFileSync(
      join(__dirname, "../fixtures/contract", symbol, "stock.json"),
      "utf8",
    ),
  ) as StockSnapshot;

export function render(el: ReactElement, locale: "en" | "fr" = "en"): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      {el}
    </NextIntlClientProvider>,
  );
}

/** Text a user would read: tags removed. */
export const visibleText = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

export const BROKEN = /NaN|undefined|\[object|\bnull\b|Infinity/;
