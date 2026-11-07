import { useSyncExternalStore } from "react";

const never = () => () => {};

/**
 * The page's query string (`?tickers=...`), or `null` on the server and during hydration. The class
 * page is static and reads its link in the browser, like the hide-AI flag (components/stock/ai-flag.ts).
 */
export function useSearchString(): string | null {
  return useSyncExternalStore(
    never,
    () => window.location.search,
    () => null,
  );
}
