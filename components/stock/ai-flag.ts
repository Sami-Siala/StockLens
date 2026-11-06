import { useSyncExternalStore } from "react";

/** Teacher flag (Step 6 builds the full links): `?hideAI=1` removes the AI section and its request. */
export function readHideAi(search: string): boolean {
  try {
    const v = new URLSearchParams(search).get("hideAI");
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

const subscribe = () => () => {};

/**
 * `true` = hide the AI, `false` = show it, `null` = not known yet (server render and the first
 * hydration pass). The section waits for a real answer, so a hidden AI never even starts a fetch.
 */
export function useHideAi(): boolean | null {
  const v = useSyncExternalStore(
    subscribe,
    () => (readHideAi(window.location.search) ? "hide" : "show"),
    () => "pending",
  );
  return v === "pending" ? null : v === "hide";
}

/**
 * What the stock page does with the AI. Nothing is rendered or requested while the flag is
 * unknown; `?hideAI=1` removes the sections and the request; the request also waits for the
 * company to exist (a typo in the URL must not spend AI quota).
 */
export function thesisPlan(
  stockReady: boolean,
  hideAi: boolean | null,
): { render: boolean; fetch: boolean } {
  const render = hideAi === false;
  return { render, fetch: render && stockReady };
}
