"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CardBoundary } from "../stock/card-boundary";

function TileCrash() {
  const t = useTranslations("Dash");
  return <p className="text-sm text-muted">{t("tileCrash")}</p>;
}

/**
 * One dashboard tile: title, one line saying what you are looking at, and a body inside its own
 * error boundary, so a tile that throws shows a calm note and the rest of the page keeps working.
 */
export function Tile({
  id,
  title,
  hint,
  children,
  className,
  headerExtra,
}: {
  id: string;
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  headerExtra?: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-2xl bg-surface p-4 sm:p-6",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 id={`${id}-title`} className="text-base font-medium">
            {title}
          </h2>
          {hint && <p className="text-sm text-muted">{hint}</p>}
        </div>
        {headerExtra}
      </header>
      <CardBoundary fallback={<TileCrash />}>{children}</CardBoundary>
    </section>
  );
}

/** Inline, calm "this tile could not load" with an optional retry. */
export function TileMessage({
  children,
  onRetry,
}: {
  children: ReactNode;
  onRetry?: () => void;
}) {
  const t = useTranslations("Dash");
  return (
    <div role="status" className="flex flex-col items-start gap-2 text-sm">
      <p className="text-muted">{children}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="-m-2 rounded-full p-2 text-foreground underline underline-offset-4"
        >
          {t("retry")}
        </button>
      )}
    </div>
  );
}
