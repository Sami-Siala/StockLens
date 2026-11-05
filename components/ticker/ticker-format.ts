/**
 * Formatting and layout rules for the market band. Pure functions, no React.
 * Reuses the Markets tile formatting (`priceParts` / `changeParts`): indices, FX and the VIX have no
 * currency, a yield is a level in % that changes in percentage points, gold is a future in USD.
 */
import type { IndexKind, TickerKind, TickerRegion } from "@/lib/contract";
import type { ReadyTickerItem } from "@/lib/data/ticker";
import {
  changeParts,
  priceParts,
  type ChangeParts,
} from "../dashboard/quote-format";

/** Scroll speed. ~44 px/s reads calmly; the duration is derived from the measured width. */
export const TICKER_SPEED_PX_S = 44;

/** Cap on repeated copies (a very wide window with very few items). */
export const TICKER_MAX_COPIES = 8;

/** The VIX is a level in points, formatted like an index. */
export function formatKind(kind: TickerKind): IndexKind {
  return kind === "volatility" ? "index" : kind;
}

export interface TickerRow {
  id: string;
  /** English label from the contract; the view swaps in a translation when it has one. */
  label: string;
  region: TickerRegion;
  /** True for the first item of a region (and of the list): draws the separator. */
  regionStart: boolean;
  level: string;
  /** "USD" for gold, "%" for the yield, otherwise null. */
  unit: string | null;
  change: ChangeParts | null;
  /** Last saved value (Yahoo failed, the stale copy was served). */
  stale: boolean;
}

export function tickerRows(
  items: ReadyTickerItem[],
  locale: string,
): TickerRow[] {
  return items.map((item, i) => {
    const kind = formatKind(item.kind);
    const price = priceParts(item, locale, kind);
    return {
      id: item.id,
      label: item.label,
      region: item.region,
      regionStart: i === 0 || items[i - 1].region !== item.region,
      level: price.amount,
      unit: price.unit,
      change: changeParts(item, locale, kind),
      stale: item.stale,
    };
  });
}

/** Seconds for one full pass over a list `listWidth` px wide. */
export function loopDuration(
  listWidth: number,
  speed = TICKER_SPEED_PX_S,
): number {
  return Math.round((listWidth / speed) * 10) / 10;
}

/**
 * How many identical lists fill the viewport plus one extra (so the track never shows a gap while it
 * slides by one list). Two is the minimum for a seamless loop.
 */
export function copiesNeeded(viewportWidth: number, listWidth: number): number {
  if (!(listWidth > 0) || !(viewportWidth > 0)) return 2;
  return Math.min(
    TICKER_MAX_COPIES,
    Math.max(2, Math.ceil(viewportWidth / listWidth) + 1),
  );
}

/**
 * Changing the animation duration mid-flight makes the track jump, so after the first measurement
 * a new duration is only taken when the list really changed size (a few more digits are ignored).
 */
export function stableDuration(
  previous: number | null,
  next: number,
  tolerance = 0.1,
): number {
  if (previous === null || previous <= 0) return next;
  return Math.abs(next - previous) / previous > tolerance ? next : previous;
}
