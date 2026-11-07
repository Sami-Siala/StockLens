import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { GlossaryList } from "@/components/learn/glossary-list";
import { PageShell } from "@/components/page-shell";
import { glossaryView } from "@/lib/education/view";

/**
 * Glossary (PLAN §5, Step 5a): the lecture vocabulary, A to Z, with anchors (`#eps`) that the
 * thesis chips and the metric cards link to. Static page; the search runs in the browser.
 */
export default function LearnPage({ params }: PageProps<"/[locale]/learn">) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("Learn");

  return (
    <PageShell narrow>
      <div className="flex flex-col gap-6 py-4">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-muted">{t("intro")}</p>
          <p className="text-sm text-muted">{t("seanceNote")}</p>
        </header>
        <GlossaryList terms={glossaryView(locale)} />
        <p role="note" className="text-sm text-muted">
          {t("notAdvice")}
        </p>
      </div>
    </PageShell>
  );
}
