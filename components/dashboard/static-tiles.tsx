"use client";

import { useTranslations } from "next-intl";
import { Tile } from "./tile";

/**
 * Tiles 9 and 10 are deliberate placeholders until the education layer (Step 5) and teacher
 * links (PLAN §6) exist. No invented content and no fake data: just what is coming.
 */
function ComingSoon() {
  const t = useTranslations("Dash");
  return (
    <span className="self-start rounded-full bg-background px-3 py-1 text-xs text-muted">
      {t("comingSoon")}
    </span>
  );
}

export function LearnTile({ className }: { className?: string }) {
  const t = useTranslations("Dash.learn");
  return (
    <Tile id="learn" title={t("title")} hint={t("hint")} className={className}>
      <p className="text-sm text-muted">{t("body")}</p>
      <ComingSoon />
    </Tile>
  );
}

export function AssignmentTile({ className }: { className?: string }) {
  const t = useTranslations("Dash.assignment");
  return (
    <Tile
      id="assignment"
      title={t("title")}
      hint={t("hint")}
      className={className}
    >
      <p className="text-sm text-muted">{t("body")}</p>
      <ComingSoon />
    </Tile>
  );
}
