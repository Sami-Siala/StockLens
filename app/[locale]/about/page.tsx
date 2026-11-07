import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { PageShell } from "@/components/page-shell";

/**
 * About, Privacy and Terms (Step 6e). Disclaimer, data and AI notes, what is stored, terms, and the
 * Lightweight Charts attribution the licence requires (NOTICE text + link to tradingview.com).
 * The wording still needs the professor's sign-off (see `reviewNote`).
 */
const SECTIONS = [
  ["whatTitle", "what"],
  ["audienceTitle", "audience"],
  ["adviceTitle", "advice"],
  ["dataTitle", "data"],
  ["aiTitle", "ai"],
  ["storageTitle", "storage"],
  ["cookiesTitle", "cookies"],
  ["serverTitle", "server"],
  ["termsTitle", "terms"],
] as const;

export default function AboutPage({ params }: PageProps<"/[locale]/about">) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("About");

  return (
    <PageShell narrow>
      <article className="flex flex-col gap-8 py-8">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>

        {SECTIONS.map(([heading, body]) => (
          <section key={heading} className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{t(heading)}</h2>
            <p>{t(body)}</p>
          </section>
        ))}

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
          <p className="text-sm text-muted">{t("credits")}</p>
        </section>

        <p className="text-sm text-muted">{t("reviewNote")}</p>
      </article>
    </PageShell>
  );
}
