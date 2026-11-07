"use client";

import { Check, Copy, Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import type { StockSnapshot, Thesis } from "@/lib/contract";
import { findEntry, useNoteEntries } from "@/lib/data/local/notes";
import { buildThesisText, type ExportDoc } from "@/lib/education/export";
import { Button } from "../ui/button";
import { buildExportDoc } from "./export-model";

/**
 * The one-page summary as a print-only block. It is `display: none` on screen; in print, the page
 * chrome and the rest of the stock page are hidden (see `print:hidden` in `StockView` and the
 * `@media print` rules in app/globals.css) and only this sheet is printed. Everything is a React
 * text node: notes and AI text never become markup.
 */
export function PrintSheet({ doc }: { doc: ExportDoc }) {
  return (
    <article className="hidden text-sm leading-snug print:block">
      <p className="text-xs text-muted">{doc.heading}</p>
      <h1 className="mt-2 text-2xl font-semibold">{doc.company}</h1>
      <p className="mt-1 text-muted">
        {doc.identity} · {doc.dateLine}
      </p>
      {doc.priceLine && <p className="mt-1">{doc.priceLine}</p>}

      <h2 className="mt-3 border-b border-border pb-1 font-semibold">
        {doc.keyTitle}
      </h2>
      {doc.rows.length === 0 ? (
        <p className="mt-2">{doc.keyNone}</p>
      ) : (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
          {doc.rows.map((r) => (
            <div key={r.label} className="contents">
              <dt className="text-muted">{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <h2 className="mt-3 border-b border-border pb-1 font-semibold">
        {doc.yourTitle}
      </h2>
      <p className="mt-2">
        <span className="text-muted">{doc.pick.label}: </span>
        {doc.pick.value}
      </p>
      <p className="mt-2 text-muted">{doc.notes.label}</p>
      <p className="whitespace-pre-wrap break-words">{doc.notes.value}</p>

      {doc.estimate && (
        <>
          <h2 className="mt-3 border-b border-border pb-1 font-semibold">
            {doc.estimate.title}
          </h2>
          {doc.estimate.lines.map((l) => (
            <p key={l} className="mt-1">
              {l}
            </p>
          ))}
        </>
      )}

      {doc.ai && (
        <>
          <h2 className="mt-3 border-b border-border pb-1 font-semibold">
            {doc.ai.title}
          </h2>
          <p className="mt-1 text-muted">{doc.ai.note}</p>
          {doc.ai.columns
            .filter((c) => c.items.length > 0)
            .map((c) => (
              <div key={c.title} className="mt-2">
                <p className="font-medium">{c.title}</p>
                <ul className="list-disc pl-5 text-xs leading-snug">
                  {c.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
        </>
      )}

      <p className="mt-3 border-t border-border pt-2 text-xs text-muted">
        {doc.disclaimer}
      </p>
      <p className="text-xs text-muted">{doc.footer}</p>
    </article>
  );
}

type CopyState = "idle" | "copied" | "failed";

/**
 * "Print / save as PDF" and "Copy as text" for the one-page summary. Works under `?hideAI=1`
 * (`thesis` is then null) and with no AI at all: the AI part is included only when it is loaded
 * AND visible on the page. If the clipboard is blocked, the text is shown to copy by hand.
 */
export function ExportActions({
  stock,
  thesis,
}: {
  stock: StockSnapshot;
  /** The AI thesis, only when loaded and visible. */
  thesis: Thesis | null;
}) {
  const t = useTranslations("Export");
  const pick = useTranslations("Turn.pick");
  const locale = useLocale();
  const entries = useNoteEntries();
  const [copy, setCopy] = useState<CopyState>("idle");

  const symbol = stock.listing.symbol.toUpperCase();
  const entry = findEntry(entries, symbol);
  const doc = useMemo(
    () =>
      buildExportDoc({
        stock,
        locale,
        // next-intl's translator takes narrower key types than the builder's plain string keys.
        t: (key, values) => t(key as never, values as never),
        pickLabel: (p) => pick(p),
        entry,
        thesis,
      }),
    [stock, locale, t, pick, entry, thesis],
  );

  // "Copied" is a passing confirmation, not a state to keep.
  useEffect(() => {
    if (copy !== "copied") return;
    const id = setTimeout(() => setCopy("idle"), 2500);
    return () => clearTimeout(id);
  }, [copy]);

  async function copyText() {
    try {
      await navigator.clipboard.writeText(buildThesisText(doc));
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  return (
    <>
      <section
        aria-labelledby="export"
        className="flex flex-col gap-3 print:hidden"
      >
        <div className="flex flex-col gap-1">
          <h2 id="export" className="text-lg font-semibold">
            {t("title")}
          </h2>
          <p className="text-sm text-muted">{t("intro")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer aria-hidden="true" className="size-4" />
            {t("print")}
          </Button>
          <Button variant="secondary" onClick={copyText}>
            {copy === "copied" ? (
              <Check aria-hidden="true" className="size-4" />
            ) : (
              <Copy aria-hidden="true" className="size-4" />
            )}
            {copy === "copied" ? t("copied") : t("copy")}
          </Button>
        </div>
        <div role="status" className="flex flex-col gap-2 text-sm text-muted">
          {copy === "failed" && (
            <>
              <p>{t("copyFailed")}</p>
              <textarea
                readOnly
                rows={8}
                value={buildThesisText(doc)}
                onFocus={(e) => e.currentTarget.select()}
                aria-label={t("title")}
                className="w-full rounded-xl bg-surface p-3 text-base text-foreground"
              />
            </>
          )}
        </div>
      </section>
      <PrintSheet doc={doc} />
    </>
  );
}
