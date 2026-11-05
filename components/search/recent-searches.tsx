"use client";

import { useTranslations } from "next-intl";
import { clearList, searchesStore, useSearches } from "@/lib/data/local/lists";
import { Link } from "../navigation";

/** Quiet chips under the search box: what this browser searched for lately. Hidden when empty. */
export function RecentSearches() {
  const t = useTranslations("Search");
  const items = useSearches();
  if (items.length === 0) return null;
  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm">
      <span className="text-muted">{t("recent")}</span>
      <ul className="flex flex-wrap justify-center gap-2">
        {items.map((c) => (
          <li key={c.symbol}>
            <Link
              href={`/stock/${encodeURIComponent(c.symbol)}`}
              className="inline-flex max-w-40 items-center truncate rounded-full bg-surface px-3 py-1 hover:opacity-80"
            >
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => clearList(searchesStore)}
        className="rounded-full px-2 py-1 text-muted hover:text-foreground"
      >
        {t("clearRecent")}
      </button>
    </div>
  );
}
