"use client";

import { Check, Info, Lock, TriangleAlert } from "lucide-react";
import { useId } from "react";
import { useTranslations } from "next-intl";
import {
  findEntry,
  NOTE_MAX_CHARS,
  PICKS,
  saveEntry,
  useNoteEntries,
  useStorageWorks,
  type Pick,
} from "@/lib/data/local/notes";
import { cn } from "@/lib/utils";
import { Link } from "../navigation";

const CARD = "rounded-2xl bg-surface p-4 sm:p-6";

function PickChoice({
  value,
  checked,
  name,
  onChange,
}: {
  value: Pick;
  checked: boolean;
  name: string;
  onChange: () => void;
}) {
  const t = useTranslations("Turn.pick");
  return (
    <label className="relative">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        className={cn(
          "inline-flex h-10 min-w-24 cursor-pointer items-center justify-center gap-2 rounded-full bg-background px-4 text-sm transition-colors hover:bg-border/60",
          "peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-purple",
        )}
      >
        {/* Selected is shape + contrast, never colour alone. */}
        {checked && <Check aria-hidden="true" className="size-4" />}
        {t(value)}
      </span>
    </label>
  );
}

/**
 * "Your turn" (PLAN §5): the student's own notes and Buy/Hold/Sell pick for this company, plus the
 * circle-of-competence question. Always shown, with or without the AI (`?hideAI=1` is the
 * "student first" flow). Everything is plain text kept in this browser (lib/data/local/notes.ts).
 */
export function YourTurn({ symbol }: { symbol: string }) {
  const t = useTranslations("Turn");
  const common = useTranslations("Common");
  const entries = useNoteEntries();
  const storage = useStorageWorks();
  const entry = findEntry(entries, symbol);
  const note = entry?.note ?? "";
  const pick = entry?.pick ?? null;
  const ids = useId();

  return (
    <section aria-labelledby="your-turn" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="your-turn" className="text-lg font-semibold">
          {t("title")}
        </h2>
        <p className="text-sm text-muted">{t("intro")}</p>
      </div>

      <div className={cn(CARD, "flex flex-col gap-6")}>
        <div className="flex flex-col gap-1">
          <h3 className="text-sm text-muted">{t("competence.title")}</h3>
          <p className="font-medium">{t("competence.question")}</p>
          <p className="text-sm text-muted">{t("competence.hint")}</p>
          <p className="text-sm">
            <Link
              href="/learn#circle_of_competence"
              className="text-link text-foreground"
            >
              {t("competence.learn")}
            </Link>
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={`${ids}-notes`}>{t("notes.label")}</label>
          <textarea
            id={`${ids}-notes`}
            value={note}
            rows={5}
            maxLength={NOTE_MAX_CHARS}
            placeholder={t("notes.placeholder")}
            aria-describedby={`${ids}-count`}
            onChange={(e) => saveEntry(symbol, { note: e.target.value })}
            className="w-full resize-y rounded-xl bg-background p-3 text-base placeholder:text-muted"
          />
          <p id={`${ids}-count`} className="text-right text-xs text-muted">
            {t("notes.count", { used: note.length, max: NOTE_MAX_CHARS })}
          </p>
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1">{t("pick.legend")}</legend>
          <p className="text-sm text-muted">{t("pick.hint")}</p>
          <div className="flex flex-wrap items-center gap-2">
            {PICKS.map((value) => (
              <PickChoice
                key={value}
                value={value}
                name={`${ids}-pick`}
                checked={pick === value}
                onChange={() => saveEntry(symbol, { pick: value })}
              />
            ))}
            {pick && (
              <button
                type="button"
                onClick={() => saveEntry(symbol, { pick: null })}
                className="-m-1 rounded-full p-3 text-sm text-muted underline underline-offset-4 hover:text-foreground"
              >
                {t("pick.clear")}
              </button>
            )}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2 text-sm text-muted">
          <p className="flex items-start gap-2">
            <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {t("storage")}
          </p>
          {!storage && (
            <p role="status" className="flex items-start gap-2">
              <TriangleAlert
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              {t("storageBlocked")}
            </p>
          )}
        </div>
      </div>

      <p role="note" className="flex items-start gap-2 text-sm text-muted">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {common("disclaimer")}
      </p>
    </section>
  );
}
