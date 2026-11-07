"use client";

import { Check, Info, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import type { StockSnapshot } from "@/lib/contract";
import { getEntry, getText } from "@/lib/education/glossary";
import {
  buildQuiz,
  type QuizParams,
  type QuizQuestion,
} from "@/lib/education/quiz";
import { cn } from "@/lib/utils";
import {
  formatMoney,
  formatMonthYear,
  formatNumber,
  formatPercent,
} from "../format";
import { SeanceTag } from "../learn/seance-tag";
import { Link } from "../navigation";
import { Button } from "../ui/button";

const CARD = "rounded-2xl bg-surface p-4 sm:p-6";

/** Raw question numbers -> text for this locale (whole numbers stay numbers for plural rules). */
export function formatQuizParams(
  params: QuizParams | undefined,
  locale: string,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, v] of Object.entries(params ?? {})) {
    switch (v.kind) {
      case "number":
        out[key] =
          v.digits === 0
            ? Math.round(v.n)
            : formatNumber(v.n, locale, {
                minimumFractionDigits: v.digits ?? 0,
                maximumFractionDigits: v.digits ?? 2,
              });
        break;
      case "percent":
        out[key] = formatPercent(v.n, locale, { digits: v.digits });
        break;
      case "money":
        out[key] = formatMoney(v.n, v.currency, locale, {
          compact: v.compact,
          ...(v.fraction !== undefined
            ? { maxFraction: v.fraction, minFraction: v.fraction }
            : {}),
        });
        break;
      case "month":
        out[key] = formatMonthYear(v.iso, locale);
        break;
      case "text":
        out[key] = v.s;
        break;
    }
  }
  return out;
}

function Question({
  q,
  index,
  total,
  onNext,
}: {
  q: QuizQuestion;
  index: number;
  total: number;
  onNext: () => void;
}) {
  const t = useTranslations("Quiz");
  const locale = useLocale();
  const [picked, setPicked] = useState<number | null>(null);
  const qid = useId();
  const answered = picked !== null;

  const values = formatQuizParams(q.params, locale);
  const optionText = (i: number) =>
    t(`rules.${q.rule}.options.${q.options[i].key}`, {
      ...values,
      ...formatQuizParams(q.options[i].params, locale),
    });
  const term = getText(q.term, locale);

  return (
    <div className={cn(CARD, "flex flex-col gap-4")}>
      <p className="text-sm text-muted">
        {t("counter", { n: index + 1, total })}
      </p>

      <div
        role="group"
        aria-labelledby={`${qid}-q`}
        className="flex flex-col gap-3"
      >
        <h3 id={`${qid}-q`} className="font-medium">
          {t(`rules.${q.rule}.question`, values)}
        </h3>
        <ul className="flex flex-col gap-2">
          {q.options.map((_, i) => {
            const isPicked = picked === i;
            const isAnswer = answered && i === q.answer;
            return (
              <li key={i}>
                <button
                  type="button"
                  aria-pressed={isPicked}
                  aria-disabled={answered}
                  onClick={() => {
                    if (!answered) setPicked(i);
                  }}
                  className={cn(
                    "flex min-h-12 w-full items-start gap-3 rounded-xl bg-background p-3 text-left transition-colors",
                    !answered && "hover:bg-border/60",
                    // Right / chosen is shape + weight + an icon, never colour alone.
                    isAnswer && "outline-2 outline-foreground",
                    isPicked && !isAnswer && "outline-2 outline-muted",
                    answered && !isAnswer && !isPicked && "text-muted",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex size-4 shrink-0 items-center justify-center"
                  >
                    {isAnswer ? (
                      <Check className="size-4" />
                    ) : isPicked ? (
                      <X className="size-4" />
                    ) : (
                      <span className="size-3 rounded-full border border-muted" />
                    )}
                  </span>
                  <span>{optionText(i)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div aria-live="polite" className="flex flex-col gap-3">
        {answered && (
          <div className="flex flex-col gap-3 rounded-xl bg-background p-3">
            <p className="font-medium">
              {picked === q.answer ? t("correct") : t("wrong")}
            </p>
            {picked !== q.answer && (
              <p className="text-sm">
                {t("answerWas", { answer: optionText(q.answer) })}
              </p>
            )}
            <p className="text-sm">
              {t(`rules.${q.rule}.explain.${q.explain}`, values)}
            </p>
            {q.ruleOfThumb && (
              <p className="flex items-start gap-2 text-sm text-muted">
                <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {t("ruleNote")}
              </p>
            )}
            <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
              <SeanceTag
                seance={getEntry(q.term).seance}
                className="bg-surface"
              />
              <Link
                href={`/learn#${q.term}`}
                className="text-link text-foreground"
              >
                {t("readMore", { term: term.name })}
              </Link>
            </p>
          </div>
        )}
      </div>

      {total > 1 && (
        <div>
          <Button
            variant="secondary"
            className="bg-background"
            onClick={onNext}
          >
            {t("next")}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Rule-based practice questions (lib/education/quiz.ts), built from this company's numbers.
 * No score, no storage: "Next question" walks through the questions that have data, in an order
 * that is the same for a given symbol and day. Funds get no quiz.
 */
export function QuizCard({ stock }: { stock: StockSnapshot }) {
  const t = useTranslations("Quiz");
  const questions = useMemo(() => buildQuiz(stock), [stock]);
  const [index, setIndex] = useState(0);

  if (stock.listing.quoteType !== "EQUITY") return null;
  const q = questions[index % Math.max(questions.length, 1)];

  return (
    <section aria-labelledby="quiz" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="quiz" className="text-lg font-semibold">
          {t("title")}
        </h2>
        <p className="text-sm text-muted">{t("intro")}</p>
      </div>
      {q ? (
        <Question
          // A new question starts unanswered.
          key={`${q.rule}-${index % questions.length}`}
          q={q}
          index={index % questions.length}
          total={questions.length}
          onNext={() => setIndex((i) => (i + 1) % questions.length)}
        />
      ) : (
        <p className={cn(CARD, "text-muted")}>{t("none")}</p>
      )}
      <p role="note" className="flex items-start gap-2 text-sm text-muted">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {t("notAdvice")}
      </p>
    </section>
  );
}
