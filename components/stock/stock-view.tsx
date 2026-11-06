"use client";

import { RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { useStock, useThesis } from "@/lib/data/hooks";
import { pushRecent, recentsStore } from "@/lib/data/local/lists";
import type { StockSnapshot } from "@/lib/contract";
import { buttonVariants } from "../ui/button";
import { Button } from "../ui/button";
import { AnimatedWordmark } from "../animated-wordmark";
import { Skeleton } from "../ui/skeleton";
import { Link } from "../navigation";
import { cn } from "@/lib/utils";
import { thesisPlan, useHideAi } from "./ai-flag";
import { AnalystSection } from "./analyst-section";
import { CardBoundary } from "./card-boundary";
import { ChartPanel } from "./chart-panel";
import { KeyNumbers } from "./key-numbers";
import { StockHeader } from "./stock-header";
import { ThesisColumns, ThesisIntro } from "./thesis";

function Guard({ children }: { children: ReactNode }) {
  const t = useTranslations("Stock");
  return (
    <CardBoundary
      fallback={
        <p className="rounded-2xl bg-surface p-4 text-sm text-muted">
          {t("sectionError")}
        </p>
      }
    >
      {children}
    </CardBoundary>
  );
}

function StockSkeleton() {
  const t = useTranslations("Stock");
  return (
    <div
      className="flex flex-col gap-8"
      role="status"
      aria-label={t("loading")}
    >
      <AnimatedWordmark className="mx-auto w-40 sm:w-48" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-10 w-1/2" />
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-64 w-full md:h-96" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    </div>
  );
}

function StockError({
  code,
  symbol,
  retry,
}: {
  code: string;
  symbol: string;
  retry: () => void;
}) {
  const t = useTranslations("Stock.errors");
  const notFound = code === "not_found" || code === "bad_request";
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-xl font-semibold">
        {notFound ? t("notFoundTitle", { symbol }) : t("title")}
      </h1>
      <p className="text-muted">
        {notFound
          ? t("notFoundBody")
          : t(code === "rate_limited" ? "rateLimited" : "unavailable")}
      </p>
      {notFound ? (
        <Link
          href="/"
          className={cn(buttonVariants({ variant: "primary", size: "lg" }))}
        >
          {t("backToSearch")}
        </Link>
      ) : (
        <Button variant="primary" size="lg" onClick={retry}>
          <RefreshCw aria-hidden="true" className="size-4" />
          {t("retry")}
        </Button>
      )}
    </div>
  );
}

function Banners({ stock }: { stock: StockSnapshot }) {
  const t = useTranslations("Stock");
  return (
    <>
      {stock.meta.stale && (
        <p role="status" className="rounded-2xl bg-surface p-3 text-sm">
          {t("stale")}
        </p>
      )}
      {stock.meta.source === "fixture" && (
        <p className="text-sm text-muted">{t("sample")}</p>
      )}
    </>
  );
}

export function StockView({ symbol }: { symbol: string }) {
  const [res, retry] = useStock(symbol);
  // The AI request starts only once the company is known to exist (it is slow and metered),
  // and never when a teacher link says `?hideAI=1`.
  const locale = useLocale() === "fr" ? "fr" : "en";
  const hideAi = useHideAi();
  const ai = thesisPlan(res.status === "ready", hideAi);
  const [thesis, retryThesis] = useThesis(symbol, locale, ai.fetch);

  const name = res.status === "ready" ? res.data.listing.name : null;
  useEffect(() => {
    if (name) document.title = `${name} (${symbol}) · StockLens`;
  }, [name, symbol]);

  // Recently viewed (home tile 4): saved once the company is known to exist.
  const listing = res.status === "ready" ? res.data.listing : null;
  useEffect(() => {
    if (listing)
      pushRecent(recentsStore, {
        symbol: listing.symbol,
        name: listing.shortName ?? listing.name,
        exchange: listing.exchange,
      });
  }, [listing]);

  if (res.status === "loading") return <StockSkeleton />;
  if (res.status === "error")
    return <StockError code={res.error.code} symbol={symbol} retry={retry} />;

  const stock = res.data;
  return (
    <div className="flex flex-col gap-8">
      <Banners stock={stock} />
      <Guard>
        <StockHeader stock={stock} />
      </Guard>
      <Guard>
        <ChartPanel listing={stock.listing} />
      </Guard>
      {ai.render && (
        <Guard>
          <ThesisIntro state={thesis} onRetry={retryThesis} />
        </Guard>
      )}
      <Guard>
        <KeyNumbers stock={stock} />
      </Guard>
      <Guard>
        <AnalystSection stock={stock} />
      </Guard>
      {ai.render && (
        <Guard>
          <ThesisColumns state={thesis} />
        </Guard>
      )}
    </div>
  );
}
