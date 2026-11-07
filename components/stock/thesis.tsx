"use client";

import {
  CloudOff,
  Clock,
  Eye,
  Info,
  Minus,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ComponentType, ReactNode } from "react";
import type { Thesis, ThesisResponse } from "@/lib/contract";
import type { Resource } from "@/lib/data/hooks";
import {
  getText,
  isGlossaryId,
  type GlossaryId,
} from "@/lib/education/glossary";
import { cn } from "@/lib/utils";
import { formatDate } from "../format";
import { Link } from "../navigation";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import {
  hasColumns,
  retryHint,
  SHORT_WAIT_SECONDS,
  text,
  textList,
} from "./thesis-logic";

/**
 * The AI explanation (PLAN §3.5, §4.1). Two sections fed by ONE request (made in `StockView`):
 *   - `ThesisIntro`: "The company in 30 seconds", or the calm reason why there is none;
 *   - `ThesisColumns`: arguments for / against / for waiting, risks, what to watch, terms, notice.
 *
 * Every string is model output, so it is only ever rendered as a React text node: no HTML and no
 * markdown, nothing injected as raw markup (a test shows `<b>` and `**x**` stay literal).
 */
export type ThesisState = Resource<ThesisResponse>;

const CARD = "rounded-2xl bg-surface p-4 sm:p-6";

function Unavailable({
  Icon,
  title,
  body,
  onRetry,
}: {
  Icon: ComponentType<{ className?: string; "aria-hidden"?: "true" }>;
  title: string;
  body: string;
  onRetry?: () => void;
}) {
  const t = useTranslations("Stock.thesis.unavailable");
  return (
    <div role="status" className={cn(CARD, "flex flex-col gap-3")}>
      <div className="flex flex-col gap-1">
        <p className="flex items-start gap-2">
          <Icon
            aria-hidden="true"
            className="mt-1 size-4 shrink-0 text-muted"
          />
          {title}
        </p>
        <p className="text-sm text-muted">{body}</p>
      </div>
      {onRetry && (
        <div>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <RefreshCw aria-hidden="true" className="size-4" />
            {t("retry")}
          </Button>
        </div>
      )}
    </div>
  );
}

function UnavailableCard({
  state,
  onRetry,
}: {
  state: ThesisState;
  onRetry: () => void;
}) {
  const t = useTranslations("Stock.thesis.unavailable");

  // Transport failure (HTTP error, offline): the same calm card, retry makes sense.
  if (state.status === "error")
    return (
      <Unavailable
        Icon={CloudOff}
        title={t("title")}
        body={t("loadFailed")}
        onRetry={onRetry}
      />
    );
  if (state.status !== "ready" || state.data.result.status !== "unavailable")
    return null;

  const { reason, retryAfter } = state.data.result;
  switch (reason) {
    case "not_applicable_for_type":
      return (
        <Unavailable
          Icon={Info}
          title={t("notApplicableTitle")}
          body={t("notApplicable")}
        />
      );
    case "quota_exhausted": {
      const hint = retryHint(retryAfter);
      const when = hint
        ? t(hint.unit === "hours" ? "quotaHours" : "quotaMinutes", {
            count: hint.count,
          })
        : t("quotaLater");
      const short =
        typeof retryAfter === "number" && retryAfter <= SHORT_WAIT_SECONDS;
      return (
        <Unavailable
          Icon={Clock}
          title={t("quotaTitle")}
          body={t("quota", { when })}
          onRetry={short ? onRetry : undefined}
        />
      );
    }
    case "model_error":
      return (
        <Unavailable
          Icon={CloudOff}
          title={t("title")}
          body={t("model_error")}
          onRetry={onRetry}
        />
      );
    case "insufficient_data":
      return (
        <Unavailable
          Icon={Info}
          title={t("title")}
          body={t("insufficient_data")}
        />
      );
    case "no_key":
    default:
      return (
        <Unavailable Icon={CloudOff} title={t("title")} body={t("no_key")} />
      );
  }
}

function Writing() {
  const t = useTranslations("Stock.thesis");
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(CARD, "flex flex-col gap-3")}
    >
      <p className="flex items-center gap-2 text-muted">
        <Sparkles aria-hidden="true" className="size-4 shrink-0" />
        {t("writing")}
      </p>
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-4 w-full bg-background" />
        <Skeleton className="h-4 w-5/6 bg-background" />
        <Skeleton className="h-4 w-2/3 bg-background" />
      </div>
      <p className="text-sm text-muted">{t("writingHint")}</p>
    </div>
  );
}

function StaleBadge({ generatedAt }: { generatedAt: string | null }) {
  const t = useTranslations("Stock.thesis");
  const locale = useLocale();
  const date = generatedAt ? formatDate(generatedAt, locale) : "";
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface px-3 py-1 text-sm text-muted">
      <Clock aria-hidden="true" className="size-4" />
      {date ? t("staleOn", { date }) : t("stale")}
    </span>
  );
}

function Intro({ thesis, stale, generatedAt }: IntroProps) {
  const t = useTranslations("Stock.thesis");
  const parts: Array<[string, string]> = [
    [t("whatItDoes"), text(thesis.whatItDoes)],
    [t("howItMakesMoney"), text(thesis.howItMakesMoney)],
  ];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id="thesis-intro" className="text-lg font-semibold">
          {t("introTitle")}
        </h2>
        {stale && <StaleBadge generatedAt={generatedAt} />}
      </div>
      <div className={cn(CARD, "flex flex-col gap-4")}>
        {parts
          .filter(([, body]) => body.trim() !== "")
          .map(([label, body]) => (
            <div key={label} className="flex flex-col gap-1">
              <h3 className="text-sm text-muted">{label}</h3>
              <p>{body}</p>
            </div>
          ))}
        <p className="flex items-start gap-2 text-sm text-muted">
          <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            {t("aiNote")} {t("notAdvice")}
          </span>
        </p>
      </div>
    </>
  );
}
type IntroProps = {
  thesis: Thesis;
  stale: boolean;
  generatedAt: string | null;
};

/** "The company in 30 seconds", placed right after the chart. Also the home of every non-ready state. */
export function ThesisIntro({
  state,
  onRetry,
}: {
  state: ThesisState;
  onRetry: () => void;
}) {
  const t = useTranslations("Stock.thesis");
  const ready =
    state.status === "ready" && state.data.result.status === "ready"
      ? { response: state.data, thesis: state.data.result.thesis }
      : null;

  return (
    <section aria-labelledby="thesis-intro" className="flex flex-col gap-3">
      {ready ? (
        <Intro
          thesis={ready.thesis}
          stale={ready.response.meta.stale === true}
          generatedAt={ready.response.meta.generatedAt}
        />
      ) : (
        <>
          <h2 id="thesis-intro" className="text-lg font-semibold">
            {t("introTitle")}
          </h2>
          {state.status === "loading" ? (
            <Writing />
          ) : (
            <UnavailableCard state={state} onRetry={onRetry} />
          )}
        </>
      )}
    </section>
  );
}

function Column({
  id,
  Icon,
  tone,
  items,
}: {
  id: "for" | "against" | "wait";
  Icon: ComponentType<{ className?: string; "aria-hidden"?: "true" }>;
  tone: string;
  items: string[];
}) {
  const t = useTranslations("Stock.thesis");
  if (items.length === 0) return null;
  return (
    <article
      aria-labelledby={`thesis-${id}`}
      className={cn(CARD, "flex flex-col gap-3")}
    >
      <header className="flex flex-col gap-1">
        <h3 id={`thesis-${id}`} className="flex items-center gap-2">
          <Icon aria-hidden="true" className={cn("size-4 shrink-0", tone)} />
          {t(`${id}.title`)}
        </h3>
        <p className="text-sm text-muted">{t(`${id}.hint`)}</p>
      </header>
      <ul className="flex list-disc flex-col gap-2 ps-4 marker:text-muted">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

function Notes({
  id,
  Icon,
  title,
  items,
}: {
  id: string;
  Icon: ComponentType<{ className?: string; "aria-hidden"?: "true" }>;
  title: string;
  items: string[];
}): ReactNode {
  if (items.length === 0) return null;
  return (
    <article aria-labelledby={id} className={cn(CARD, "flex flex-col gap-3")}>
      <h3 id={id} className="flex items-center gap-2 text-sm text-muted">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {title}
      </h3>
      <ul className="flex list-disc flex-col gap-2 ps-4 marker:text-muted">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

/** Terms the model cites: chips that open the glossary at that term. Unknown ids are skipped. */
function Terms({ ids }: { ids: unknown }) {
  const t = useTranslations("Stock.thesis");
  const locale = useLocale();
  const list = textList(ids).filter((id): id is GlossaryId => isGlossaryId(id));
  if (list.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 id="thesis-terms" className="text-sm text-muted">
        {t("terms")}
      </h3>
      <ul aria-labelledby="thesis-terms" className="flex flex-wrap gap-2">
        {list.map((id) => (
          <li key={id}>
            <Link
              href={`/learn#${id}`}
              className="inline-block rounded-full bg-surface px-3 py-1 text-sm text-muted hover:text-foreground"
            >
              {getText(id, locale).name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Arguments for / against / for waiting (stacked on a phone, side by side from `md`), then risks and watch-list. */
export function ThesisColumns({ state }: { state: ThesisState }) {
  const t = useTranslations("Stock.thesis");
  // Loading, unavailable and error live in `ThesisIntro`: nothing to say twice.
  if (state.status !== "ready" || state.data.result.status !== "ready")
    return null;
  const thesis = state.data.result.thesis;
  const risks = textList(thesis.keyRisks);
  const watch = textList(thesis.whatToWatch);

  return (
    <section aria-labelledby="thesis-args" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="thesis-args" className="text-lg font-semibold">
          {t("argsTitle")}
        </h2>
        <p className="text-sm text-muted">{t("argsIntro")}</p>
      </div>
      {hasColumns(thesis) && (
        <div className="grid gap-3 md:grid-cols-3">
          <Column
            id="for"
            Icon={TrendingUp}
            tone="text-positive"
            items={textList(thesis.bullCase)}
          />
          <Column
            id="against"
            Icon={TrendingDown}
            tone="text-negative"
            items={textList(thesis.bearCase)}
          />
          <Column
            id="wait"
            Icon={Minus}
            tone="text-muted"
            items={textList(thesis.holdCase)}
          />
        </div>
      )}
      {(risks.length > 0 || watch.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          <Notes
            id="thesis-risks"
            Icon={TriangleAlert}
            title={t("risks")}
            items={risks}
          />
          <Notes
            id="thesis-watch"
            Icon={Eye}
            title={t("watch")}
            items={watch}
          />
        </div>
      )}
      <Terms ids={thesis.glossaryTerms} />
      <p role="note" className="flex items-start gap-2 text-sm text-muted">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {t("notAdvice")}
      </p>
    </section>
  );
}
