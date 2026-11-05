/**
 * Pure helpers for the scrolling market band (no React, no browser APIs): easy to test.
 * Contract v0.3.1 (`TickerResponse`).
 */
import type { TickerItem, TickerResponse } from "@/lib/contract";
import { isNum } from "@/components/format";

/** Below this many usable items the band hides itself: a three-item strip looks broken. */
export const TICKER_MIN_ITEMS = 4;

/** Polite refresh for the whole app: one request per ~60 s, shared by every page. */
export const TICKER_REFRESH_MS = 60_000;

/** An item that can be drawn: `ok` with a real number (the contract guarantees it, we still check). */
export type ReadyTickerItem = TickerItem & { price: number };

export function isReadyItem(item: TickerItem): item is ReadyTickerItem {
  return item.status === "ok" && isNum(item.price);
}

/**
 * What the band shows: unavailable items are skipped entirely (a ticker with dashes looks broken),
 * the contract's fixed order is kept, and an empty list is returned when too few items remain.
 */
export function tickerItems(
  response: TickerResponse | null | undefined,
): ReadyTickerItem[] {
  const items = (response?.items ?? []).filter(isReadyItem);
  return items.length >= TICKER_MIN_ITEMS ? items : [];
}
