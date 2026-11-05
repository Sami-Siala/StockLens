import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Dashboard } from "@/components/dashboard/dashboard";
import { PageShell } from "@/components/page-shell";
import { RecentSearches } from "@/components/search/recent-searches";
import { SearchBox } from "@/components/search/search-box";
import { Wordmark } from "@/components/wordmark";

export default function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("Home");

  return (
    <PageShell home>
      <div className="flex flex-col gap-8 pb-8">
        <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 pt-4 text-center md:pt-8">
          <Wordmark className="w-56 md:w-72" priority />
          <h1 className="text-balance text-xl font-semibold md:text-2xl">
            {t("tagline")}
          </h1>
          <SearchBox />
          <RecentSearches />
        </div>
        <Dashboard />
      </div>
    </PageShell>
  );
}
