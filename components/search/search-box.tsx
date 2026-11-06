"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type KeyboardEvent } from "react";
import type { InstrumentType, SearchHit } from "@/lib/contract";
import { useSearch } from "@/lib/data/hooks";
import { pushRecent, searchesStore } from "@/lib/data/local/lists";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { useRouter } from "../navigation";
import { useDebounced } from "./use-debounced";

/** Only things that have a company-style page. Futures, currencies, crypto etc. are hidden. */
const SHOWN: InstrumentType[] = ["EQUITY", "ETF", "MUTUALFUND", "INDEX"];
const TICKER_LIKE = /^[A-Za-z0-9^][A-Za-z0-9.^=-]{0,11}$/;

export function SearchBox({
  autoFocus = false,
  compact = false,
  onNavigate,
}: {
  autoFocus?: boolean;
  /** Header popover variant: shorter field, no submit button (Enter submits). */
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("Search");
  const router = useRouter();
  const listId = useId();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const debounced = useDebounced(value, 250);
  const [result] = useSearch(debounced);

  const trimmed = value.trim();
  const settled = trimmed !== "" && trimmed === debounced.trim();
  const hits: SearchHit[] =
    settled && result.status === "ready"
      ? result.data.filter((h) => SHOWN.includes(h.quoteType)).slice(0, 8)
      : [];
  const loading = trimmed !== "" && (!settled || result.status === "loading");
  const failed = settled && result.status === "error";
  const empty = settled && result.status === "ready" && hits.length === 0;
  const showPanel = open && trimmed !== "";

  function go(symbol: string, hit?: SearchHit) {
    setOpen(false);
    onNavigate?.();
    pushRecent(searchesStore, {
      symbol,
      name: hit?.name ?? symbol,
      exchange: hit?.exchange ?? "",
    });
    router.push(`/stock/${encodeURIComponent(symbol)}`);
  }

  function submit() {
    if (active >= 0 && hits[active])
      return go(hits[active].symbol, hits[active]);
    if (hits[0]) return go(hits[0].symbol, hits[0]);
    // Typed a ticker before results arrived: go straight there.
    if (TICKER_LIKE.test(trimmed)) return go(trimmed.toUpperCase());
    setOpen(true);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && hits.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % hits.length);
    } else if (e.key === "ArrowUp" && hits.length) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? hits.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <form
      role="search"
      className="relative w-full"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted",
              compact ? "left-3.5 size-4" : "left-4 size-5",
            )}
          />
          <input
            type="search"
            role="combobox"
            aria-expanded={showPanel}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              active >= 0 ? `${listId}-${active}` : undefined
            }
            aria-label={t("label")}
            placeholder={t("placeholder")}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            autoFocus={autoFocus}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setActive(-1);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
            className={cn(
              "w-full rounded-full bg-surface pr-4 placeholder:text-muted",
              compact ? "h-10 pl-10 text-sm" : "h-12 pl-12 text-base",
            )}
          />
        </div>
        {!compact && (
          <Button type="submit" variant="primary" size="lg">
            {t("submit")}
          </Button>
        )}
      </div>

      <p role="status" className="sr-only">
        {showPanel && settled && !failed
          ? t("count", { count: hits.length })
          : ""}
      </p>

      {showPanel && (
        <div
          className="absolute inset-x-0 top-full z-10 mt-2 overflow-hidden rounded-2xl border border-border bg-background shadow-lg"
          // Keep focus in the input while the pointer is inside the panel.
          onMouseDown={(e) => e.preventDefault()}
        >
          <ul
            id={listId}
            role="listbox"
            aria-label={t("results")}
            className="text-left"
          >
            {hits.map((hit, i) => (
              <li
                key={hit.symbol}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onClick={() => go(hit.symbol, hit)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-4 px-4 py-3",
                  i === active && "bg-surface",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{hit.name}</span>
                  <span className="block truncate text-sm text-muted">
                    {hit.exchange}:{hit.symbol}
                  </span>
                </span>
                {hit.quoteType !== "EQUITY" && (
                  <span className="shrink-0 rounded-full bg-surface px-2 py-1 text-xs text-muted">
                    {t(`type.${hit.quoteType}`)}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {loading && (
            <div className="flex flex-col gap-3 p-4" aria-hidden="true">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          )}
          {failed && <p className="p-4 text-sm text-muted">{t("error")}</p>}
          {empty && <p className="p-4 text-sm text-muted">{t("empty")}</p>}
        </div>
      )}
    </form>
  );
}
