"use client";

import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SearchBox } from "./search-box";

/** Magnifier in the header. Opens a compact search under it; "/" opens it too, Escape closes it. */
export function HeaderSearch() {
  const t = useTranslations("Nav");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el?.isContentEditable;
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape") setOpen(false);
    }
    function onDown(e: MouseEvent) {
      if (root.current && !root.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, []);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={open ? t("closeSearch") : t("search")}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-full transition-colors",
          open
            ? "bg-surface text-foreground"
            : "text-muted hover:bg-surface hover:text-foreground",
        )}
      >
        {open ? (
          <X aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
        ) : (
          <Search aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-3xl border border-border bg-background p-2 shadow-lg">
          <SearchBox compact autoFocus onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
