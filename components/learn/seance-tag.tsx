import { useTranslations } from "next-intl";
import type { Seance } from "@/lib/education/glossary";
import { cn } from "@/lib/utils";

/**
 * "Séance 2": where the club taught this term. Quiet pill, no colour: it is a label, not an alert.
 * Renders nothing for terms the lectures do not cover.
 */
export function SeanceTag({
  seance,
  className,
}: {
  seance: Seance | null;
  /** Background override for when the tag sits on a `bg-background` panel. */
  className?: string;
}) {
  const t = useTranslations("Learn");
  if (seance === null) return null;
  return (
    <span
      title={t("seanceTitle", { n: seance })}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full bg-background px-3 py-1 text-xs text-muted",
        className,
      )}
    >
      {t("seance", { n: seance })}
    </span>
  );
}
