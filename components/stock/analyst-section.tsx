import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { PriceTarget, RatingCounts, StockSnapshot } from "@/lib/contract";
import { cn } from "@/lib/utils";
import { formatMoney, formatPercent, isNum } from "../format";
import { CardBoundary } from "./card-boundary";
import { fromMetric } from "./metrics";

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
      <h3 className="text-sm text-muted">{title}</h3>
      {children}
    </div>
  );
}

/** Strong buy + buy, hold, sell + strong sell: the three groups the stacked bar shows. */
export function groupRatings(r: RatingCounts) {
  const n = (v: number) => (isNum(v) && v > 0 ? v : 0);
  const buy = n(r.strongBuy) + n(r.buy);
  const hold = n(r.hold);
  const sell = n(r.sell) + n(r.strongSell);
  return { buy, hold, sell, total: buy + hold + sell };
}

/** Where a value sits on the target bar, in percent (0 = left end, 100 = right end). */
export function barPosition(value: number, min: number, max: number): number {
  if (!(max > min)) return 50;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

function RatingsBar({ counts }: { counts: RatingCounts }) {
  const t = useTranslations("Stock.analysts");
  const g = groupRatings(counts);
  if (g.total === 0)
    return <p className="text-sm text-muted">{t("noRatings")}</p>;
  const pct = (v: number) => (v / g.total) * 100;
  const rows = [
    {
      key: "buy",
      n: g.buy,
      Icon: ArrowUp,
      bar: "bg-positive",
      text: "text-positive",
    },
    {
      key: "hold",
      n: g.hold,
      Icon: Minus,
      bar: "bg-muted",
      text: "text-muted",
    },
    {
      key: "sell",
      n: g.sell,
      Icon: ArrowDown,
      bar: "bg-negative",
      text: "text-negative",
    },
  ] as const;
  const label = rows.map((r) => `${t(r.key)} ${r.n}`).join(", ");

  return (
    <>
      <p className="text-sm text-muted">{t("count", { count: g.total })}</p>
      <div
        role="img"
        aria-label={label}
        className="flex h-3 w-full gap-1 overflow-hidden rounded-full"
      >
        {rows.map(
          (r) =>
            r.n > 0 && (
              <div
                key={r.key}
                className={cn(
                  "h-full first:rounded-l-full last:rounded-r-full",
                  r.bar,
                )}
                style={{ width: `${pct(r.n)}%` }}
              />
            ),
        )}
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-col">
            <span className={cn("flex items-center gap-1 text-sm", r.text)}>
              <r.Icon aria-hidden="true" className="size-4" />
              {t(r.key)}
            </span>
            <span className="text-lg">{r.n}</span>
            <span className="text-sm text-muted">{Math.round(pct(r.n))}%</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function TargetBar({
  target,
  price,
}: {
  target: PriceTarget;
  price: number | null;
}) {
  const t = useTranslations("Stock.analysts");
  const locale = useLocale();
  const values = [target.low, target.mean, target.high];
  if (!values.every(isNum) || !(target.high >= target.low))
    return <p className="text-sm text-muted">{t("noTarget")}</p>;

  const min = Math.min(target.low, price ?? target.low);
  const max = Math.max(target.high, price ?? target.high);
  const pad = (max - min) * 0.04;
  const lo = min - pad;
  const hi = max + pad;
  const pos = (v: number) => barPosition(v, lo, hi);
  const money = (v: number) =>
    formatMoney(v, target.currency, locale, {
      maxFraction: Math.abs(v) >= 100 ? 0 : 2,
    });
  const diff = price && price > 0 ? target.mean / price - 1 : null;
  const pricePos = price !== null ? pos(price) : null;

  return (
    <>
      {isNum(target.analysts) && (
        <p className="text-sm text-muted">
          {t("targetCount", { count: target.analysts })}
        </p>
      )}
      <div className="relative h-12">
        {price !== null && pricePos !== null && (
          <p
            className={cn(
              "absolute top-0 whitespace-nowrap text-sm",
              pricePos < 20
                ? "left-0"
                : pricePos > 80
                  ? "right-0"
                  : "-translate-x-1/2",
            )}
            style={
              pricePos >= 20 && pricePos <= 80
                ? { left: `${pricePos}%` }
                : undefined
            }
          >
            {t("now", { price: money(price) })}
          </p>
        )}
        <div className="absolute inset-x-0 bottom-0 h-3 rounded-full bg-background" />
        <div
          className="absolute bottom-0 h-3 rounded-full bg-border"
          style={{
            left: `${pos(target.low)}%`,
            width: `${pos(target.high) - pos(target.low)}%`,
          }}
        />
        <div
          aria-hidden="true"
          className="absolute bottom-0 h-3 w-0.5 bg-foreground"
          style={{ left: `${pos(target.mean)}%` }}
        />
        {pricePos !== null && (
          <div
            aria-hidden="true"
            className="absolute bottom-0 size-3 -translate-x-1/2 rounded-full bg-brand-gradient ring-2 ring-background"
            style={{ left: `${pricePos}%` }}
          />
        )}
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {(
          [
            ["low", target.low],
            ["mean", target.mean],
            ["high", target.high],
          ] as const
        ).map(([k, v], i) => (
          <div
            key={k}
            className={cn(
              "flex flex-col",
              i === 1 && "items-center",
              i === 2 && "items-end",
            )}
          >
            <dt className="text-sm text-muted">{t(k)}</dt>
            <dd className="text-base">{money(v)}</dd>
          </div>
        ))}
      </dl>
      {diff !== null && isNum(diff) && (
        <p className="flex items-center gap-1 text-sm text-muted">
          {diff >= 0 ? (
            <ArrowUp aria-hidden="true" className="size-4" />
          ) : (
            <ArrowDown aria-hidden="true" className="size-4" />
          )}
          {t(diff >= 0 ? "meanAbove" : "meanBelow", {
            pct: formatPercent(Math.abs(diff), locale),
          })}
        </p>
      )}
    </>
  );
}

export function AnalystSection({ stock }: { stock: StockSnapshot }) {
  const t = useTranslations("Stock.analysts");
  const r = useTranslations("Stock.reasons");
  const a = fromMetric(stock.analysts);
  const quote = fromMetric(stock.quote);
  const price =
    quote.ok && isNum(quote.value.price.amount) ? quote.value.price : null;

  const ratings = a.ok ? fromMetric(a.value.ratings) : null;
  const target = a.ok ? fromMetric(a.value.priceTarget) : null;

  const failed = (
    <p className="rounded-2xl bg-surface p-4 text-sm text-muted">
      {t("error")}
    </p>
  );

  // Target in another currency than the price (TSM-style data) is hidden, never mixed.
  const targetMismatch =
    target?.ok === true &&
    price !== null &&
    target.value.currency !== price.currency;
  const targetHidden =
    (target && !target.ok && target.reason === "currency_mismatch") ||
    targetMismatch;

  return (
    <section aria-labelledby="analysts-title" className="flex flex-col gap-3">
      <h2 id="analysts-title" className="text-lg font-semibold">
        {t("title")}
      </h2>
      <p className="text-sm text-muted">{t("intro")}</p>
      {!a.ok ? (
        <Panel title={t("title")}>
          <p className="text-sm text-muted">{r(a.reason)}</p>
        </Panel>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <CardBoundary fallback={failed}>
            <Panel title={t("ratings")}>
              {ratings?.ok ? (
                <RatingsBar counts={ratings.value} />
              ) : (
                <p className="text-sm text-muted">
                  {r(
                    ratings?.ok === false
                      ? ratings.reason
                      : "not_provided_by_source",
                  )}
                </p>
              )}
            </Panel>
          </CardBoundary>
          <CardBoundary fallback={failed}>
            <Panel title={t("targets")}>
              {targetHidden ? (
                <p className="text-sm text-muted">{t("targetHidden")}</p>
              ) : target?.ok ? (
                <TargetBar
                  target={target.value}
                  price={price ? price.amount : null}
                />
              ) : (
                <p className="text-sm text-muted">
                  {r(
                    target?.ok === false
                      ? target.reason
                      : "not_provided_by_source",
                  )}
                </p>
              )}
            </Panel>
          </CardBoundary>
        </div>
      )}
    </section>
  );
}
