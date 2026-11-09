import type { QuoteLite, QuotesResponse } from "@/lib/contract";
import type { PolledResource } from "@/lib/data/hooks";

/** What one row (one company) can show. A failing symbol only degrades its own row. */
export type RowState =
  | { kind: "loading" }
  | { kind: "ok"; quote: QuoteLite; stale: boolean }
  | { kind: "missing"; reason: "not_found" | "unavailable" };

export function rowState(
  symbol: string,
  quotes: PolledResource<QuotesResponse>,
): RowState {
  if (quotes.status === "loading") return { kind: "loading" };
  if (quotes.status === "error")
    return { kind: "missing", reason: "unavailable" };
  const entry = quotes.data.entries.find(
    (e) => e.symbol === symbol.toUpperCase(),
  );
  if (!entry)
    return quotes.updating
      ? { kind: "loading" }
      : { kind: "missing", reason: "unavailable" };
  if (entry.status === "ok" && entry.quote.value)
    return { kind: "ok", quote: entry.quote.value, stale: entry.stale };
  return {
    kind: "missing",
    reason:
      entry.status === "not_found" || entry.status === "invalid"
        ? "not_found"
        : "unavailable",
  };
}
