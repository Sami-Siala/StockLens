"use client";

import { Info, Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import type { StockSnapshot } from "@/lib/contract";
import { findEntry, saveEntry, useNoteEntries } from "@/lib/data/local/notes";
import { getEntry } from "@/lib/education/glossary";
import {
  ESTIMATE_MAX_CHARS,
  isMajorCurrency,
  marginOfSafety,
  type Margin,
  parseEstimate,
} from "@/lib/education/margin-of-safety";
import { cn } from "@/lib/utils";
import { formatMoney, formatNumber, formatPercent, isNum } from "../format";
import { SeanceTag } from "../learn/seance-tag";
import { Link } from "../navigation";
import { fromMetric } from "./metrics";

const CARD = "rounded-2xl bg-surface p-4 sm:p-6";

/** Why the card cannot be used for this company, or null when it can (price known, plain currency). */
export function marginHiddenReason(
  stock: StockSnapshot,
): "fund" | "quote" | "currency" | null {
  if (stock.listing.quoteType !== "EQUITY") return "fund";
  if (!isMajorCurrency(stock.listing.priceCurrency)) return "currency";
  const q = fromMetric(stock.quote);
  if (!q.ok || !(isNum(q.value.price.amount) && q.value.price.amount > 0))
    return "quote";
  if (q.value.price.currency !== stock.listing.priceCurrency) return "currency";
  return null;
}

/** The numbers and the plain sentence for one estimate (price and estimate in the same currency). */
export function MarginResult({
  price,
  value,
  currency,
  result,
}: {
  price: number;
  value: number;
  currency: string;
  result: Margin;
}) {
  const t = useTranslations("Safety");
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2">
        <dt className="text-sm text-muted">{t("price")}</dt>
        <dd className="text-right">{formatMoney(price, currency, locale)}</dd>
        <dt className="text-sm text-muted">{t("estimate")}</dt>
        <dd className="text-right">{formatMoney(value, currency, locale)}</dd>
        <dt className="text-sm text-muted">
          {t("margin")}
          <span className="block text-xs">{t("formula")}</span>
        </dt>
        <dd className="text-right text-2xl">
          {formatPercent(result.margin, locale, { signed: true })}
        </dd>
      </dl>
      <p>{t(result.side, { pct: formatPercent(result.size, locale) })}</p>
      {result.side !== "about_equal" && (
        <p className="text-sm text-muted">
          {t(result.upside >= 0 ? "gapAbove" : "gapBelow", {
            pct: formatPercent(Math.abs(result.upside), locale),
          })}
        </p>
      )}
      {result.farFromPrice && (
        <p role="status" className="text-sm">
          {t("far")}
        </p>
      )}
    </div>
  );
}

/**
 * Margin of safety (club Séance 4): the student types THEIR OWN estimate of what one share is
 * worth, in the price currency, and sees how far the price is from it. The estimate is saved with
 * the notes of this company (lib/data/local/notes.ts), in this browser only. It is an input to
 * think with, never a prediction or advice.
 */
export function MarginCard({ stock }: { stock: StockSnapshot }) {
  const t = useTranslations("Safety");
  const locale = useLocale();
  const entries = useNoteEntries();
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);

  const { listing } = stock;
  const symbol = listing.symbol.toUpperCase();
  const reason = marginHiddenReason(stock);
  const entry = findEntry(entries, symbol);
  const term = getEntry("margin_of_safety");

  const head = (
    <div className="flex flex-col gap-1">
      <h2
        id="safety"
        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-lg font-semibold"
      >
        {t("title")}
        <SeanceTag seance={term.seance} />
      </h2>
      <p className="text-sm text-muted">{t("intro")}</p>
    </div>
  );

  if (reason)
    return (
      <section aria-labelledby="safety" className="flex flex-col gap-3">
        {head}
        <p className={cn(CARD, "text-muted")}>{t(`hidden.${reason}`)}</p>
      </section>
    );

  const currency = listing.priceCurrency;
  const q = fromMetric(stock.quote);
  const price = q.ok ? q.value.price.amount : 0;
  const stored =
    entry?.estimate && entry.estimate.currency === currency
      ? entry.estimate.amount
      : null;
  const text =
    draft ??
    (stored !== null
      ? formatNumber(stored, locale, {
          maximumFractionDigits: 4,
          useGrouping: false,
        })
      : "");
  const parsed = text.trim() === "" ? null : parseEstimate(text, locale);
  const value = parsed && parsed.ok ? parsed.value : null;
  const result = value !== null ? marginOfSafety(price, value) : null;
  const problem = parsed && !parsed.ok ? parsed.problem : null;
  const subunit = listing.priceSubunit;

  function onChange(next: string) {
    setDraft(next);
    if (next.trim() === "") {
      saveEntry(symbol, { estimate: null });
      return;
    }
    const p = parseEstimate(next, locale);
    if (p.ok) saveEntry(symbol, { estimate: { amount: p.value, currency } });
  }

  return (
    <section aria-labelledby="safety" className="flex flex-col gap-3">
      {head}
      <div className={cn(CARD, "flex flex-col gap-4")}>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-estimate`}>{t("label", { currency })}</label>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <input
              id={`${id}-estimate`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              maxLength={ESTIMATE_MAX_CHARS}
              value={text}
              placeholder={t("placeholder")}
              aria-invalid={problem !== null}
              aria-describedby={`${id}-hint${problem ? ` ${id}-error` : ""}`}
              onChange={(e) => onChange(e.target.value)}
              onBlur={() => {
                // Leave a half-typed, invalid text behind: show the saved estimate again.
                if (problem) setDraft(null);
              }}
              className="w-40 rounded-xl bg-background p-3 text-base placeholder:text-muted"
            />
            <span className="text-muted">{currency}</span>
            {value !== null && (
              <button
                type="button"
                onClick={() => {
                  setDraft("");
                  saveEntry(symbol, { estimate: null });
                }}
                className="-m-1 rounded-full p-3 text-sm text-muted underline underline-offset-4 hover:text-foreground"
              >
                {t("clear")}
              </button>
            )}
          </div>
          <p id={`${id}-hint`} className="text-sm text-muted">
            {t("hint")}
          </p>
          {subunit && (
            <p className="text-sm text-muted">
              {t("subunit", {
                currency,
                quotedAs: subunit.quotedAs,
                factor: subunit.factor,
              })}
            </p>
          )}
          {problem && (
            <p id={`${id}-error`} role="alert" className="text-sm">
              {t(`errors.${problem}`)}
            </p>
          )}
        </div>

        {result && value !== null && (
          <MarginResult
            price={price}
            value={value}
            currency={currency}
            result={result}
          />
        )}

        <div className="flex flex-col gap-2 text-sm text-muted">
          <p className="flex items-start gap-2">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {t("notAdvice")}
          </p>
          <p className="flex items-start gap-2">
            <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {t("saved")}
          </p>
          <p>
            <Link
              href="/learn#margin_of_safety"
              className="text-link text-foreground"
            >
              {t("learn")}
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
