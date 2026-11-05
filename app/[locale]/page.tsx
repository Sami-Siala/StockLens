import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Link } from "@/components/navigation";
import { PageShell } from "@/components/page-shell";
import { SearchBox } from "@/components/search/search-box";
import { Wordmark } from "@/components/wordmark";
import { START_HERE } from "@/lib/education/start-here";

export default function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("Home");

  return (
    <PageShell home>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-8 py-16 text-center">
        <div className="flex flex-col items-center gap-4">
          <Wordmark className="w-56 md:w-72" priority />
          <h1 className="text-balance text-xl font-semibold md:text-2xl">
            {t("tagline")}
          </h1>
        </div>

        <SearchBox />

        <section aria-labelledby="start-here" className="flex flex-col gap-3">
          <h2 id="start-here" className="text-sm text-muted">
            {t("startHere")}
          </h2>
          <ul className="flex flex-wrap justify-center gap-2">
            {START_HERE.map((s) => (
              <li key={s.symbol}>
                <Link
                  href={`/stock/${encodeURIComponent(s.symbol)}`}
                  className="inline-flex flex-col items-start rounded-2xl bg-surface px-4 py-2 text-left hover:opacity-80"
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="text-sm text-muted">
                    {s.exchange}:{s.symbol}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
