import { useTranslations } from "next-intl";
import { Link } from "./navigation";

/** Disclaimer + data caveats, on every page (PLAN §4.1 item 8). */
export function SiteFooter() {
  const t = useTranslations("Footer");
  return (
    <footer className="mx-auto mt-auto w-full max-w-5xl px-4 py-8">
      <div className="flex flex-col gap-2 border-t border-border pt-6 text-sm text-muted">
        <p className="font-medium text-foreground">{t("disclaimer")}</p>
        <p>{t("data")}</p>
        <p>
          <Link href="/about" className="text-link text-foreground">
            {t("about")}
          </Link>
        </p>
      </div>
    </footer>
  );
}
