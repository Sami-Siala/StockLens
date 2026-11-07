import {
  getEntry,
  getText,
  sortedGlossary,
  type GlossaryId,
  type Seance,
} from "./glossary";

/** One glossary term in one language: what the page and the tiles actually render. */
export interface TermView {
  id: GlossaryId;
  seance: Seance | null;
  name: string;
  short: string;
  definition: string;
  formula?: string;
  example: string;
  ruleOfThumb?: string;
  related: Array<{ id: GlossaryId; name: string }>;
}

export function termView(id: GlossaryId, locale: string): TermView {
  const entry = getEntry(id);
  return {
    id,
    seance: entry.seance,
    ...getText(id, locale),
    related: entry.related.map((r) => ({
      id: r,
      name: getText(r, locale).name,
    })),
  };
}

/** The whole glossary in `locale`, A to Z. */
export function glossaryView(locale: string): TermView[] {
  return sortedGlossary(locale).map((e) => termView(e.id, locale));
}
