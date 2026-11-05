import "server-only";
import type { SearchHit } from "@/lib/contract";
import { ProviderError } from "../errors";
import { SearchResultSchema } from "../schemas";
import { instrumentType } from "./helpers";

/** Instrument types worth showing a student; news/lists/options noise is dropped by Yahoo's own `quotes` list. */
export function normalizeSearch(raw: unknown, limit = 8): SearchHit[] {
  const parsed = SearchResultSchema.safeParse(raw);
  if (!parsed.success)
    throw new ProviderError("invalid_payload", "Unusable search payload");
  const seen = new Set<string>();
  const hits: SearchHit[] = [];
  for (const h of parsed.data.quotes) {
    const name = h.longname ?? h.shortname;
    if (!h.symbol || !name || h.isYahooFinance === false) continue;
    if (seen.has(h.symbol)) continue;
    seen.add(h.symbol);
    hits.push({
      symbol: h.symbol,
      name,
      exchange: h.exchDisp ?? h.exchange ?? "",
      exchangeCode: h.exchange ?? "",
      quoteType: instrumentType(h.quoteType),
      sector: h.sector ?? null,
      industry: h.industry ?? null,
    });
    if (hits.length >= limit) break;
  }
  return hits;
}
