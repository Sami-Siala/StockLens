/**
 * Forgiving text search for the glossary. Kept apart from the glossary data so the client search
 * box does not pull both languages of every term into its bundle.
 */

/** Lower-case, accent-free text ("benefice" finds "Bénéfice"). */
export function foldForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** True when every word of `query` appears in `text` (accents and case ignored; empty query = true). */
export function matchesQuery(text: string, query: string): boolean {
  const words = foldForSearch(query.trim()).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = foldForSearch(text);
  return words.every((w) => hay.includes(w));
}
