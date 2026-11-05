"use client";

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  isStarred,
  toggleWatch,
  useWatchlist,
  WATCHLIST_MAX,
  type SavedCompany,
} from "@/lib/data/local/lists";
import { cn } from "@/lib/utils";

/**
 * Star toggle: follow / unfollow a company in this browser's watchlist (PLAN §4.3 tile 3).
 * `aria-pressed` carries the state, the filled star is the visual cue (shape, not colour).
 */
export function WatchStar({
  company,
  className,
}: {
  company: SavedCompany;
  className?: string;
}) {
  const t = useTranslations("Dash.watchlist");
  const items = useWatchlist();
  const starred = isStarred(items, company.symbol);
  const [full, setFull] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-pressed={starred}
        aria-label={t(starred ? "remove" : "add", { name: company.name })}
        title={t(starred ? "removeShort" : "addShort")}
        onClick={() => setFull(!toggleWatch(company))}
        className={cn(
          "inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:text-foreground",
          starred && "text-foreground",
          className,
        )}
      >
        <Star
          aria-hidden="true"
          className={cn("size-5", starred && "fill-current")}
        />
      </button>
      {full && !starred && (
        <p role="status" className="basis-full text-sm text-muted">
          {t("full", { max: WATCHLIST_MAX })}
        </p>
      )}
    </>
  );
}
