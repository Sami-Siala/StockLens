"use client";

import { ArrowRight, ListChecks } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { forgetClassLink, useLastClassLink } from "@/lib/data/local/class-link";
import { classHref, type ClassLink } from "@/lib/education/class-link";
import { termOfTheDay } from "@/lib/education/glossary";
import { termView } from "@/lib/education/view";
import { SeanceTag } from "../learn/seance-tag";
import { Link } from "../navigation";
import { Tile } from "./tile";

/** Tile 9: the term of the day (same for everyone on the same Paris day), linking to the glossary. */
export function LearnTile({
  className,
  date,
}: {
  className?: string;
  /** Injected by tests; the app uses today. */
  date?: Date;
}) {
  const t = useTranslations("Dash.learn");
  const locale = useLocale();
  const day = date ? date.getTime() : undefined;
  const term = useMemo(
    () =>
      termView(
        termOfTheDay(day === undefined ? new Date() : new Date(day)).id,
        locale,
      ),
    [day, locale],
  );
  return (
    <Tile id="learn" title={t("title")} hint={t("hint")} className={className}>
      <div className="flex flex-col items-start gap-3">
        <div className="flex flex-col gap-1">
          <Link
            href={`/learn#${term.id}`}
            className="text-lg font-semibold hover:underline"
          >
            {term.name}
          </Link>
          <p className="text-sm text-muted">{term.short}</p>
        </div>
        <SeanceTag seance={term.seance} />
        <Link href="/learn" className="text-sm text-link text-foreground">
          {t("all")}
        </Link>
      </div>
    </Tile>
  );
}

/**
 * Tile 10: the last class link this student opened (kept in this browser by the class page). The
 * card goes straight back to it, with the teacher's hide-AI choice intact.
 */
export function AssignmentView({
  link,
  onForget,
}: {
  link: ClassLink | null;
  onForget?: () => void;
}) {
  const t = useTranslations("Dash.assignment");
  if (!link)
    return (
      <div className="flex flex-col items-start gap-3 text-sm">
        <div className="flex items-start gap-3">
          <ListChecks
            aria-hidden="true"
            className="mt-1 size-5 shrink-0 text-muted"
          />
          <p className="text-muted">{t("empty")}</p>
        </div>
        <Link href="/class" className="text-link text-foreground">
          {t("make")}
        </Link>
      </div>
    );
  return (
    <div className="flex flex-col items-start gap-3">
      <Link
        href={classHref(link)}
        className="flex w-full items-center gap-3 rounded-xl bg-background p-3 hover:bg-border/60"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          {/* Plain text: the title was cleaned and clipped when the link was read. */}
          <span className="truncate font-medium">
            {link.title || t("untitled")}
          </span>
          <span className="truncate text-sm text-muted">
            {link.tickers.join(" · ")}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
            {t("count", { count: link.tickers.length })}
            {link.hideAi && (
              <span className="rounded-full bg-surface px-2 py-0.5">
                {t("hideAi")}
              </span>
            )}
          </span>
        </span>
        <span className="sr-only">{t("open")}</span>
        <ArrowRight aria-hidden="true" className="size-5 shrink-0 text-muted" />
      </Link>
      {onForget && (
        <button
          type="button"
          onClick={onForget}
          className="-m-2 rounded-full p-2 text-sm text-muted underline underline-offset-4 hover:text-foreground"
        >
          {t("forget")}
        </button>
      )}
    </div>
  );
}

export function AssignmentTile({ className }: { className?: string }) {
  const t = useTranslations("Dash.assignment");
  const link = useLastClassLink();
  return (
    <Tile
      id="assignment"
      title={t("title")}
      hint={t("hint")}
      className={className}
    >
      <AssignmentView link={link} onForget={() => forgetClassLink()} />
    </Tile>
  );
}
