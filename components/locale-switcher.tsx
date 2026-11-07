"use client";

import { useLocale, useTranslations } from "next-intl";
import { routing } from "@/i18n/routing";
import { Link, usePathname } from "./navigation";
import { cn } from "@/lib/utils";

/** FR | EN toggle. A plain link per language, so it works without JavaScript. */
export function LocaleSwitcher() {
  const current = useLocale();
  const pathname = usePathname();
  const t = useTranslations("Nav");

  return (
    <nav aria-label={t("language")} className="flex items-center gap-1 text-sm">
      {routing.locales.map((locale) => (
        <Link
          key={locale}
          href={pathname}
          locale={locale}
          lang={locale}
          hrefLang={locale}
          aria-current={locale === current ? "true" : undefined}
          aria-label={`${locale.toUpperCase()}, ${t(locale === "fr" ? "switchToFr" : "switchToEn")}`}
          className={cn(
            "rounded-full px-2 py-1 uppercase sm:px-3",
            locale === current
              ? "bg-surface font-medium text-foreground"
              : "text-muted hover:text-foreground",
          )}
        >
          {locale}
        </Link>
      ))}
    </nav>
  );
}
