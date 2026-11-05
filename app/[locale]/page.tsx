import Image from "next/image";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";

export default function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("Home");
  const c = useTranslations("Common");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <Image
        src="/brand/wordmark.webp"
        alt="StockLens"
        width={1200}
        height={259}
        priority
        className="h-auto w-64 dark:hidden"
      />
      <Image
        src="/brand/wordmark-light.webp"
        alt="StockLens"
        width={1200}
        height={259}
        priority
        className="hidden h-auto w-64 dark:block"
      />
      <p className="text-xl font-medium">{t("tagline")}</p>
      <p className="text-muted">{t("status")}</p>
      <p className="text-sm text-muted">{c("disclaimer")}</p>
    </main>
  );
}
