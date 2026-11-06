import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "./locale-switcher";
import { Link } from "./navigation";
import { HeaderSearch } from "./search/header-search";
import { Wordmark } from "./wordmark";

/**
 * Top bar. Left: wordmark (the home page already has it as the hero, so it only shows the nav there),
 * then the main links. Right: search magnifier (not on home, where the search box is the hero) and FR | EN.
 */
export function SiteHeader({ home = false }: { home?: boolean }) {
  const t = useTranslations("Nav");
  const link =
    "rounded-full px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface hover:text-foreground";
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
      <div className="flex items-center gap-4 md:gap-6">
        {!home && (
          <Link href="/" aria-label={t("home")} className="shrink-0">
            <Wordmark className="w-24" priority />
          </Link>
        )}
        <nav aria-label={t("main")} className="flex items-center gap-1">
          <Link href="/" className={link}>
            {t("markets")}
          </Link>
          <Link href="/about" className={link}>
            {t("about")}
          </Link>
        </nav>
      </div>
      <div className="flex items-center gap-2">
        {!home && <HeaderSearch />}
        <LocaleSwitcher />
      </div>
    </header>
  );
}
