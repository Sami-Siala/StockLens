import {
  classQuery,
  normaliseClassLink,
  type ClassLink,
} from "@/lib/education/class-link";
import { createListStore, useListStore, type StorageLike } from "./store";

/**
 * The last class link the student opened (home tile 10). One entry; what is stored is the parsed
 * list, re-validated on read, never a raw URL.
 */
export function createClassLinkStore(storage?: () => StorageLike | null) {
  return createListStore<ClassLink>({
    key: "stocklens:class:v1",
    max: 1,
    validate: normaliseClassLink,
    id: () => "last",
    storage,
  });
}

export const classLinkStore = createClassLinkStore();

export function rememberClassLink(
  link: ClassLink,
  store = classLinkStore,
): boolean {
  const clean = normaliseClassLink(link);
  if (!clean) return false;
  const [old] = store.read();
  // Opening the same link again must not write (or notify) again.
  if (old && classQuery(old) === classQuery(clean)) return true;
  store.write([clean]);
  return true;
}

export function forgetClassLink(store = classLinkStore): void {
  store.write([]);
}

export const useLastClassLink = (): ClassLink | null =>
  useListStore(classLinkStore)[0] ?? null;
