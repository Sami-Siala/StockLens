import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { PageShell } from "@/components/page-shell";

/**
 * About page (DRAFT, Step 3): disclaimer, data credits and the Lightweight Charts attribution
 * the licence requires (NOTICE text + link to tradingview.com). The full Privacy & Terms
 * wording comes in Step 6 and needs the professor's sign-off.
 */
export default function AboutPage({ params }: PageProps<"/[locale]/about">) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("About");

  return (
    <PageShell narrow>
      <article className="flex flex-col gap-8 py-8">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t("whatTitle")}</h2>
          <p>{t("what")}</p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t("adviceTitle")}</h2>
          <p>{t("advice")}</p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t("dataTitle")}</h2>
          <p>{t("data")}</p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t("storageTitle")}</h2>
          <p>{t("storage")}</p>
        </section>

        <section aria-labelledby="attribution" className="flex flex-col gap-2">
          <h2 id="attribution" className="text-lg font-semibold">
            {t("creditsTitle")}
          </h2>
          {/* NOTICE text from github.com/tradingview/lightweight-charts (kept verbatim). */}
          <p>TradingView Lightweight Charts™</p>
          <p>
            Copyright (с) 2025 TradingView, Inc.{" "}
            <a
              href="https://www.tradingview.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-link"
            >
              https://www.tradingview.com/
            </a>
          </p>
          <p className="text-sm text-muted">{t("draft")}</p>
        </section>
      </article>
    </PageShell>
  );
}
