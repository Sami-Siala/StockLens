"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { termForCard } from "@/lib/education/glossary";
import { SeanceTag } from "../learn/seance-tag";
import { Link } from "../navigation";

/**
 * "Explain" disclosure: definition + formula + rule of thumb. Inline (not a floating tooltip),
 * so it works with touch, keyboard and screen readers. Copy: messages `Stock.cards.<id>`.
 * When the glossary has the matching term (`lib/education/glossary.ts`), the panel ends with the
 * lecture "Séance" tag and a "Read more" link to `/learn#<term>`.
 */
export function ExplainToggle({ id }: { id: string }) {
  const t = useTranslations("Stock.cards");
  const e = useTranslations("Stock.explain");
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const term = termForCard(id);

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="-m-2 inline-flex items-center gap-1 rounded-full p-2 text-sm text-muted hover:text-foreground"
      >
        <Info aria-hidden="true" className="size-4" />
        <span>{e("button")}</span>
        <span className="sr-only">: {t(`${id}.title`)}</span>
      </button>
      {open && (
        <div
          id={panelId}
          className="col-span-2 mt-2 flex flex-col gap-3 rounded-xl bg-background p-3 text-sm"
        >
          <dl className="flex flex-col gap-2">
            <div>
              <dt className="text-muted">{e("definition")}</dt>
              <dd>{t(`${id}.definition`)}</dd>
            </div>
            <div>
              <dt className="text-muted">{e("formula")}</dt>
              <dd>{t(`${id}.formula`)}</dd>
            </div>
            <div>
              <dt className="text-muted">{e("rule")}</dt>
              <dd>{t(`${id}.rule`)}</dd>
            </div>
          </dl>
          {term && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <SeanceTag seance={term.seance} className="bg-surface" />
              <Link
                href={`/learn#${term.id}`}
                className="text-link text-foreground"
              >
                {e("readMore")}
              </Link>
            </p>
          )}
        </div>
      )}
    </>
  );
}
