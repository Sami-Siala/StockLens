"use client";

import { useLocale, useTranslations } from "next-intl";
import type { NextEarnings } from "@/lib/contract";
import { earningsWhen } from "./quote-format";

/** "Reports 28 Jan" / "Reports today" / "Reported today": never a future date for today. */
export function EarningsText({
  earnings,
  now,
}: {
  earnings: NextEarnings;
  now: Date;
}) {
  const t = useTranslations("Dash.earnings");
  const locale = useLocale();
  const when = earningsWhen(earnings, now);
  if (!when) return null;
  const date = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(earnings.date));
  const label =
    when.kind === "reportsToday"
      ? t("reportsToday")
      : when.kind === "reportedToday"
        ? t("reportedToday")
        : t(when.kind, { date });
  return (
    <>
      {label}
      {earnings.isEstimate && when.kind === "reportsOn" && (
        <> ({t("estimated")})</>
      )}
    </>
  );
}
