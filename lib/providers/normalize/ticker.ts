import "server-only";
import type { TickerItem } from "@/lib/contract";
import type { BatchOutcome } from "../cached-batch";
import type { TickerSpec } from "../ticker-config";
import type { CoreBundle } from "../types";
import { liteFromCore } from "./lite";

const finite = (n: number | null | undefined): number | null =>
  typeof n === "number" && Number.isFinite(n) ? n : null;

/**
 * One configured symbol + its (possibly missing) cached core outcome -> a band item. Never
 * throws: anything unusable (failed call without a stale copy, unknown symbol, no price) is an
 * `unavailable` item with every number `null`, so one symbol can never fail the route.
 */
export function tickerItem(
  spec: TickerSpec,
  outcome: BatchOutcome<CoreBundle> | undefined,
  now: Date,
): { item: TickerItem; fetchedAt: number | null } {
  const unavailable = (stale: boolean, fetchedAt: number | null) => ({
    item: {
      id: spec.id,
      label: spec.label,
      region: spec.region,
      kind: spec.kind,
      symbol: spec.symbol,
      price: null,
      change: null,
      changePercent: null,
      priceCurrency: null,
      marketState: "UNKNOWN" as const,
      delayMinutes: null,
      asOf: null,
      status: "unavailable" as const,
      stale,
    },
    fetchedAt,
  });
  if (!outcome || !outcome.ok) return unavailable(false, null);

  const { data, stale, fetchedAt } = outcome.value;
  const lite = liteFromCore(data, now);
  if (lite.value === null) return unavailable(stale, fetchedAt);
  const price = finite(lite.value.price);
  if (price === null) return unavailable(stale, fetchedAt);

  // Same rule as the dashboard strip (`stripItemQuote`): points, FX rates and yields are not
  // money; only a futures contract keeps its currency.
  const q = lite.value;
  const priceCurrency = spec.kind === "future" ? q.priceCurrency : null;
  return {
    item: {
      id: spec.id,
      label: spec.label,
      region: spec.region,
      kind: spec.kind,
      symbol: spec.symbol,
      price,
      change: finite(q.change),
      changePercent: finite(q.changePercent),
      priceCurrency,
      marketState: q.marketState,
      delayMinutes: finite(q.delayMinutes),
      asOf: q.asOf,
      status: "ok",
      stale,
    },
    fetchedAt,
  };
}
