"use client";

import { Check, Copy, ExternalLink, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import {
  CLASS_MAX_TICKERS,
  CLASS_TITLE_MAX,
  classUrl,
  type ClassLink,
} from "@/lib/education/class-link";
import { SearchBox } from "../search/search-box";
import { Button } from "../ui/button";
import { copyText } from "./copy";

interface Picked {
  symbol: string;
  name: string;
}

/**
 * "Make a class link" (PLAN §6): a teacher picks companies, optionally hides the AI and adds a
 * title, then copies one absolute URL. The list lives inside the URL; nothing is stored anywhere.
 */
export function ClassBuilder({
  initial,
  origin,
}: {
  /** Start from the link being viewed, so a teacher can adjust it. */
  initial?: ClassLink;
  /** Injected by tests; the app uses the page's own origin. */
  origin?: string;
}) {
  const t = useTranslations("Class.builder");
  const locale = useLocale();
  const ids = useId();
  const field = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked[]>(
    () => initial?.tickers.map((symbol) => ({ symbol, name: symbol })) ?? [],
  );
  const [hideAi, setHideAi] = useState(initial?.hideAi ?? false);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [full, setFull] = useState(false);
  const [copy, setCopy] = useState<"idle" | "ok" | "failed">("idle");

  const link: ClassLink = {
    tickers: picked.map((p) => p.symbol),
    hideAi,
    title,
  };
  const url =
    picked.length === 0
      ? ""
      : classUrl(
          link,
          origin ??
            (typeof window === "undefined" ? "" : window.location.origin),
          locale,
        );

  function add(p: { symbol: string; name: string }) {
    const symbol = p.symbol.toUpperCase();
    setCopy("idle");
    if (picked.some((x) => x.symbol === symbol)) return;
    if (picked.length >= CLASS_MAX_TICKERS) return setFull(true);
    setFull(false);
    setPicked([...picked, { symbol, name: p.name || symbol }]);
  }

  function remove(symbol: string) {
    setCopy("idle");
    setFull(false);
    setPicked(picked.filter((p) => p.symbol !== symbol));
  }

  async function onCopy() {
    setCopy((await copyText(url, field.current)) ? "ok" : "failed");
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">
        {t("intro", { max: CLASS_MAX_TICKERS })}
      </p>

      <SearchBox compact onSelect={add} fieldClassName="bg-background" />

      <div className="flex flex-col gap-2">
        <h3 className="text-sm text-muted">{t("companies")}</h3>
        {picked.length === 0 ? (
          <p className="text-sm text-muted">{t("none")}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {picked.map((p) => (
              <li
                key={p.symbol}
                className="inline-flex max-w-full items-center rounded-full bg-background ps-4 text-sm"
              >
                <span className="truncate">
                  {p.name === p.symbol ? (
                    p.symbol
                  ) : (
                    <>
                      {p.name} <span className="text-muted">{p.symbol}</span>
                    </>
                  )}
                </span>
                <button
                  type="button"
                  aria-label={t("remove", { name: p.name })}
                  onClick={() => remove(p.symbol)}
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:text-foreground"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {full && (
          <p role="status" className="text-sm text-muted">
            {t("full", { max: CLASS_MAX_TICKERS })}
          </p>
        )}
      </div>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={hideAi}
          onChange={(e) => {
            setHideAi(e.target.checked);
            setCopy("idle");
          }}
          className="mt-1 size-4 accent-foreground"
        />
        <span className="flex flex-col gap-1">
          <span>{t("hideAi")}</span>
          <span className="text-sm text-muted">{t("hideAiHint")}</span>
        </span>
      </label>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${ids}-title`}>{t("titleLabel")}</label>
        <input
          id={`${ids}-title`}
          type="text"
          value={title}
          maxLength={CLASS_TITLE_MAX}
          placeholder={t("titlePlaceholder")}
          autoComplete="off"
          onChange={(e) => {
            setTitle(e.target.value);
            setCopy("idle");
          }}
          className="h-12 w-full rounded-xl bg-background px-4 text-base placeholder:text-muted"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${ids}-url`}>{t("linkLabel")}</label>
        {url === "" ? (
          <p className="text-sm text-muted">{t("needOne")}</p>
        ) : (
          <>
            <input
              id={`${ids}-url`}
              ref={field}
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="h-12 w-full rounded-xl bg-background px-4 text-sm"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" size="lg" onClick={onCopy}>
                {copy === "ok" ? (
                  <Check aria-hidden="true" className="size-4" />
                ) : (
                  <Copy aria-hidden="true" className="size-4" />
                )}
                {t("copy")}
              </Button>
              <a
                href={url}
                className="inline-flex items-center gap-2 rounded-full px-3 py-3 text-sm text-muted hover:text-foreground"
              >
                <ExternalLink aria-hidden="true" className="size-4" />
                {t("open")}
              </a>
            </div>
          </>
        )}
        <p role="status" className="min-h-5 text-sm text-muted">
          {copy === "ok"
            ? t("copied")
            : copy === "failed"
              ? t("copyFailed")
              : ""}
        </p>
      </div>
    </div>
  );
}
