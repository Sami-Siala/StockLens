"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { SeanceTag } from "./seance-tag";
import { matchesQuery } from "@/lib/education/search";
import type { TermView } from "@/lib/education/view";

function Field({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Term({ term }: { term: TermView }) {
  const t = useTranslations("Learn");
  return (
    <article
      id={term.id}
      aria-labelledby={`${term.id}-name`}
      // `:target` = the term a link pointed at (#eps): a quiet ring, no colour.
      className="flex scroll-mt-6 flex-col gap-3 rounded-2xl bg-surface p-4 target:ring-2 target:ring-foreground/30 sm:p-6"
    >
      <header className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <h2 id={`${term.id}-name`} className="text-lg font-semibold">
            {term.name}
          </h2>
          <SeanceTag seance={term.seance} />
        </div>
        <p className="text-sm text-muted">{term.short}</p>
      </header>
      <p>{term.definition}</p>
      <dl className="flex flex-col gap-3 rounded-xl bg-background p-3 text-sm">
        {term.formula && <Field label={t("formula")}>{term.formula}</Field>}
        <Field label={t("example")}>{term.example}</Field>
        {term.ruleOfThumb && (
          <Field label={t("rule")}>{term.ruleOfThumb}</Field>
        )}
      </dl>
      {term.related.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span>{t("related")}</span>
          {term.related.map((r) => (
            <a
              key={r.id}
              href={`#${r.id}`}
              className="text-link text-foreground"
            >
              {r.name}
            </a>
          ))}
        </p>
      )}
    </article>
  );
}

/** The glossary: search box + the terms A to Z. Filtering is local; nothing is sent anywhere. */
export function GlossaryList({ terms }: { terms: TermView[] }) {
  const t = useTranslations("Learn");
  const [query, setQuery] = useState("");
  const inputId = useId();

  const shown = useMemo(
    () =>
      terms.filter((term) =>
        matchesQuery(
          `${term.name} ${term.short} ${term.definition} ${term.id}`,
          query,
        ),
      ),
    [terms, query],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="sr-only">
          {t("searchLabel")}
        </label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <input
            id={inputId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            autoComplete="off"
            spellCheck={false}
            className="h-12 w-full rounded-full bg-surface ps-12 pe-4 text-base text-foreground placeholder:text-muted"
          />
        </div>
        <p role="status" aria-live="polite" className="text-sm text-muted ps-4">
          {t("count", { count: shown.length })}
        </p>
      </div>

      {shown.length === 0 ? (
        <p role="status" className="rounded-2xl bg-surface p-4 text-muted">
          {t("none", { query: query.trim() })}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {shown.map((term) => (
            <Term key={term.id} term={term} />
          ))}
        </div>
      )}
    </div>
  );
}
