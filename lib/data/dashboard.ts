/** Pure helpers for the home dashboard (no React, no browser APIs): easy to test. */
/** The batch endpoint takes at most 25 symbols (contract v0.3.0). */
export const QUOTES_MAX = 25;

/** Polite refresh: one cached upstream refresh per ~60 s for the whole class (PLAN §4.3). */
export const REFRESH_MS = 60_000;

/**
 * ONE batched /api/quotes call for every tile: watchlist first, then the curated starters, then
 * recents. De-duplicated, upper-case, capped at the API limit. Order is stable so the request
 * key only changes when the set of companies changes.
 */
export function unionSymbols(
  ...lists: Array<ReadonlyArray<{ symbol: string }>>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists)
    for (const { symbol } of list) {
      const s = symbol.trim().toUpperCase();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
  return out.slice(0, QUOTES_MAX);
}

export function shouldRefresh(input: {
  hidden: boolean;
  reducedMotion: boolean;
  lastFetchAt: number;
  now: number;
  intervalMs?: number;
}): boolean {
  const interval = input.intervalMs ?? REFRESH_MS;
  if (input.hidden || input.reducedMotion) return false;
  // 1 s of slack so an interval tick that lands a hair early still counts.
  return input.now - input.lastFetchAt >= interval - 1000;
}
