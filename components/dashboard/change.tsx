import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { ChangeParts } from "./quote-format";

/** Day change with an arrow and a screen-reader word: never colour alone. */
export function Change({
  change,
  className,
  compact = false,
}: {
  change: ChangeParts;
  className?: string;
  /** Smaller arrow, for dense strips such as the market band. */
  compact?: boolean;
}) {
  const t = useTranslations("Dash");
  const { direction } = change;
  const Arrow =
    direction === "up" ? ArrowUp : direction === "down" ? ArrowDown : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-sm",
        direction === "up" && "text-positive",
        direction === "down" && "text-negative",
        direction === "flat" && "text-muted",
        className,
      )}
    >
      <Arrow
        aria-hidden="true"
        className={cn("shrink-0", compact ? "size-3" : "size-4")}
      />
      <span className="sr-only">{t(`direction.${direction}`)}</span>
      <span>
        {change.text}
        {change.points && (
          <abbr title={t("pointsHint")} className="no-underline">
            {" "}
            {t("pointsUnit")}
          </abbr>
        )}
      </span>
    </span>
  );
}
