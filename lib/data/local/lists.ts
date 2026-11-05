import { createListStore, useListStore, type ListStore } from "./store";

/** One company in a local list. Name and exchange are saved so a row can render without a quote. */
export interface SavedCompany {
  symbol: string;
  name: string;
  exchange: string;
}

/** Limits keep the dashboard to one batched quote call (the API takes at most 25 symbols). */
export const WATCHLIST_MAX = 12;
export const RECENTS_MAX = 6;
export const SEARCHES_MAX = 5;

const SYMBOL = /^[A-Za-z0-9^][A-Za-z0-9.^=-]{0,11}$/;

function validateCompany(v: unknown): SavedCompany | null {
  if (!v || typeof v !== "object") return null;
  const { symbol, name, exchange } = v as Record<string, unknown>;
  if (typeof symbol !== "string" || !SYMBOL.test(symbol)) return null;
  const clean = (x: unknown, fallback: string) =>
    typeof x === "string" && x.trim() ? x.trim().slice(0, 120) : fallback;
  return {
    symbol: symbol.toUpperCase(),
    name: clean(name, symbol.toUpperCase()),
    exchange: clean(exchange, ""),
  };
}

const company = (key: string, max: number) =>
  createListStore<SavedCompany>({
    key,
    max,
    validate: validateCompany,
    id: (c) => c.symbol,
  });

/** Starred companies, oldest first (new stars go to the end). */
export const watchlistStore = company("stocklens:watchlist:v1", WATCHLIST_MAX);
/** Companies whose page was opened, newest first. */
export const recentsStore = company("stocklens:recents:v1", RECENTS_MAX);
/** Searches the student ran, newest first. */
export const searchesStore = company("stocklens:searches:v1", SEARCHES_MAX);

/** Add (or move to the front) `item` in a newest-first list. */
export function pushRecent(
  store: ListStore<SavedCompany>,
  item: SavedCompany,
): void {
  const clean = validateCompany(item);
  if (!clean) return;
  const rest = store.read().filter((c) => c.symbol !== clean.symbol);
  store.write([clean, ...rest]);
}

export function isStarred(items: SavedCompany[], symbol: string): boolean {
  return items.some((c) => c.symbol === symbol.toUpperCase());
}

/** Star or un-star. Returns false when the watchlist is full and the star was refused. */
export function toggleWatch(
  item: SavedCompany,
  store: ListStore<SavedCompany> = watchlistStore,
): boolean {
  const clean = validateCompany(item);
  if (!clean) return false;
  const items = store.read();
  if (isStarred(items, clean.symbol)) {
    store.write(items.filter((c) => c.symbol !== clean.symbol));
    return true;
  }
  if (items.length >= WATCHLIST_MAX) return false;
  store.write([...items, clean]);
  return true;
}

export function clearList(store: ListStore<SavedCompany>): void {
  store.write([]);
}

export const useWatchlist = () => useListStore(watchlistStore);
export const useRecents = () => useListStore(recentsStore);
export const useSearches = () => useListStore(searchesStore);
