import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
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
    "rounded-full px-2 py-1.5 text-sm whitespace-nowrap text-muted transition-colors hover:bg-surface hover:text-foreground sm:px-3";
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
      <div className="flex items-center gap-2 sm:gap-4 md:gap-6">
        {!home && (
          <Link href="/" aria-label={t("home")} className="shrink-0">
            <Wordmark className="w-20 sm:w-24" priority />
          </Link>
        )}
        <nav aria-label={t("main")} className="flex items-center gap-1">
          {/* On a phone the wordmark is already the way home: the room goes to the other links. */}
          <Link href="/" className={cn(link, !home && "hidden sm:block")}>
            {t("markets")}
          </Link>
          <Link href="/learn" className={link}>
            {t("learn")}
          </Link>
          <Link href="/about" className={link}>
            {t("about")}
          </Link>
        </nav>
      </div>
      <div className="flex items-center gap-1 sm:gap-2">
        {!home && <HeaderSearch />}
        <LocaleSwitcher />
      </div>
    </header>
  );
}
