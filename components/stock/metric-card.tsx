import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { UnavailableReason } from "@/lib/contract";
import { ExplainToggle } from "./explain-toggle";

/** The one-sentence "why is this missing" shared by every card. */
export function UnavailableNote({ reason }: { reason: UnavailableReason }) {
  const t = useTranslations("Stock");
  return (
    <div className="flex flex-col gap-1">
      <p className="text-lg text-muted">{t("na")}</p>
      <p className="text-sm text-muted">{t(`reasons.${reason}`)}</p>
    </div>
  );
}

/**
 * One key-number card: plain label, value (or a calm "not available" with the reason),
 * one-line meaning, and an Explain disclosure. `body` null + `reason` = unavailable.
 */
export function MetricCard({
  id,
  body,
  reason,
}: {
  id: "eps" | "pe" | "revenue" | "operating" | "fcf" | "marketCap";
  body: ReactNode | null;
  reason?: UnavailableReason;
}) {
  const t = useTranslations("Stock.cards");
  return (
    <article
      aria-labelledby={`card-${id}`}
      className="grid grid-cols-[1fr_auto] content-start gap-x-3 gap-y-2 rounded-2xl bg-surface p-4"
    >
      <h3 id={`card-${id}`} className="text-sm text-muted">
        {t(`${id}.title`)}
      </h3>
      <ExplainToggle id={id} />
      <div className="col-span-2 flex flex-col gap-1">
        {body ?? (
          <UnavailableNote reason={reason ?? "not_provided_by_source"} />
        )}
      </div>
      <p className="col-span-2 text-sm text-muted">{t(`${id}.meaning`)}</p>
    </article>
  );
}
