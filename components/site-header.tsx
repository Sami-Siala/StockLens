import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "./locale-switcher";
import { Link } from "./navigation";
import { Wordmark } from "./wordmark";

/** Quiet top bar. On the home page the wordmark is the hero, so the bar only holds the language toggle. */
export function SiteHeader({ home = false }: { home?: boolean }) {
  const t = useTranslations("Nav");
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
      {home ? (
        <span />
      ) : (
        <Link href="/" aria-label={t("home")} className="shrink-0">
          <Wordmark className="w-24" priority />
        </Link>
      )}
      <LocaleSwitcher />
    </header>
  );
}
