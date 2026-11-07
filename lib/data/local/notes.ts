import { useSyncExternalStore } from "react";
import { ESTIMATE_MAX, ESTIMATE_MIN } from "@/lib/education/margin-of-safety";
import { isValidSymbol } from "./lists";
import {
  browserStorage,
  createListStore,
  useListStore,
  type ListStore,
  type StorageLike,
} from "./store";

/**
 * "Your turn" (PLAN §5, Step 5b): the student's own notes and Buy/Hold/Sell pick, per company, in
 * this browser only. The pick is the student's argument to evaluate, never advice.
 *
 * Same rules as the other local lists: every storage access is in try/catch, the page works
 * without storage (memory for the session), and values read back are validated, never trusted.
 * Notes are plain text only: they are rendered as text nodes and exported as text.
 */
export const PICKS = ["buy", "hold", "sell"] as const;
export type Pick = (typeof PICKS)[number];

/** The student's own value estimate for one share (Séance 4, margin of safety), in the price currency. */
export interface Estimate {
  amount: number;
  /** Major-unit ISO code the number was typed in; an estimate is ignored if the currency changes. */
  currency: string;
}

export interface NoteEntry {
  symbol: string;
  /** Plain text, at most `NOTE_MAX_CHARS` characters. */
  note: string;
  pick: Pick | null;
  /** Absent when the student gave no estimate. */
  estimate?: Estimate;
  /** Epoch ms of the last change. */
  updatedAt: number;
}

export const NOTE_MAX_CHARS = 2000;
/** Companies with a saved note or pick; the oldest is dropped past this (about 200 KB at most). */
export const NOTES_MAX_ENTRIES = 100;

export const isPick = (v: unknown): v is Pick =>
  typeof v === "string" && (PICKS as readonly string[]).includes(v);

/** Clean text for storage: a string, capped, and `""` when it holds nothing but whitespace. */
export function cleanNote(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.slice(0, NOTE_MAX_CHARS);
  return s.trim() === "" ? "" : s;
}

/** A clean estimate or `undefined`: finite, within bounds, with a 3-letter uppercase currency. */
export function cleanEstimate(v: unknown): Estimate | undefined {
  if (!v || typeof v !== "object") return undefined;
  const { amount, currency } = v as Record<string, unknown>;
  if (typeof amount !== "number" || !Number.isFinite(amount)) return undefined;
  if (amount < ESTIMATE_MIN || amount > ESTIMATE_MAX) return undefined;
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency))
    return undefined;
  return { amount, currency };
}

function validateEntry(v: unknown): NoteEntry | null {
  if (!v || typeof v !== "object") return null;
  const { symbol, note, pick, updatedAt, estimate } = v as Record<
    string,
    unknown
  >;
  if (!isValidSymbol(symbol)) return null;
  const entry: NoteEntry = {
    symbol: symbol.toUpperCase(),
    note: cleanNote(note),
    pick: isPick(pick) ? pick : null,
    updatedAt:
      typeof updatedAt === "number" && Number.isFinite(updatedAt)
        ? updatedAt
        : 0,
  };
  const est = cleanEstimate(estimate);
  if (est) entry.estimate = est;
  return entry.note === "" && entry.pick === null && !est ? null : entry;
}

export function createNotesStore(
  storage?: () => StorageLike | null,
): ListStore<NoteEntry> {
  return createListStore<NoteEntry>({
    key: "stocklens:notes:v1",
    max: NOTES_MAX_ENTRIES,
    validate: validateEntry,
    id: (e) => e.symbol,
    storage,
  });
}

export const notesStore = createNotesStore();

export function findEntry(
  items: NoteEntry[],
  symbol: string,
): NoteEntry | undefined {
  const s = symbol.toUpperCase();
  return items.find((e) => e.symbol === s);
}

/**
 * Change the note, the pick and/or the value estimate of one company. An entry with none of the three is removed.
 * Returns false (and stores nothing) for a malformed symbol.
 */
export function saveEntry(
  symbol: string,
  patch: { note?: string; pick?: Pick | null; estimate?: Estimate | null },
  store: ListStore<NoteEntry> = notesStore,
  now: number = Date.now(),
): boolean {
  if (!isValidSymbol(symbol)) return false;
  const sym = symbol.toUpperCase();
  const items = store.read();
  const old = findEntry(items, sym);
  const next: NoteEntry = {
    symbol: sym,
    note: patch.note !== undefined ? cleanNote(patch.note) : (old?.note ?? ""),
    pick:
      patch.pick !== undefined
        ? isPick(patch.pick)
          ? patch.pick
          : null
        : (old?.pick ?? null),
    updatedAt: now,
  };
  const estimate =
    patch.estimate !== undefined
      ? cleanEstimate(patch.estimate)
      : old?.estimate;
  if (estimate) next.estimate = estimate;
  const rest = items.filter((e) => e.symbol !== sym);
  store.write(
    next.note === "" && next.pick === null && !estimate
      ? rest
      : [next, ...rest],
  );
  return true;
}

export const useNoteEntries = () => useListStore(notesStore);

/** True when the browser really keeps what we write (private mode and blocked storage say no). */
export function storageWorks(storage: StorageLike | null = browserStorage()) {
  if (!storage) return false;
  const probe = "stocklens:probe";
  try {
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

let probed: boolean | null = null;
const never = () => () => {};

/** `true` on the server and during hydration (no scary notice before we know), then the real answer. */
export function useStorageWorks(): boolean {
  return useSyncExternalStore(
    never,
    () => (probed ??= storageWorks()),
    () => true,
  );
}
