import type { Thesis } from "@/lib/contract";
import { ThesisSchema } from "./schema";

/**
 * Numbers integrity (PLAN §3.5): the model never writes a data figure. It writes `{{metric_id}}`
 * and the server renders the number from the fact sheet. This module is the gate between "what the
 * model said" and "what a student reads". Anything doubtful is REFUSED (the caller retries or falls
 * back to another model), never silently patched.
 */

const PLACEHOLDER = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

/** Phrases that turn an argument into advice. The prompt forbids them; this catches the slip. */
const ADVICE =
  /\b(buy (it )?now|sell (it )?now|you should (buy|sell)|must (buy|sell)|guaranteed|risk[- ]free|can'?t lose|sure thing|achetez (maintenant|vite)|vendez (maintenant|vite)|vous devez (acheter|vendre)|garanti|sans risque)\b/i;

const SMALL_INTEGER = /^(?:[1-9]|10)$/;

const FIELDS_TEXT = ["whatItDoes", "howItMakesMoney"] as const;
const FIELDS_LIST = [
  "bullCase",
  "bearCase",
  "holdCase",
  "keyRisks",
  "whatToWatch",
] as const;

export type CheckResult =
  { ok: true; thesis: Thesis } | { ok: false; problems: string[] };

/** Markdown/emphasis leftovers a model likes to add. Output is plain text, so they are removed. */
function clean(s: string): string {
  return s
    .replace(/[*`#]+/g, "")
    .replace(/^\s*[-•–]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function checkString(
  where: string,
  s: string,
  ids: ReadonlySet<string>,
  problems: string[],
): string {
  const text = clean(s).replace(PLACEHOLDER, (_m, id: string) => {
    const key = id.toLowerCase();
    if (!ids.has(key))
      problems.push(
        `${where}: "{{${id}}}" is not an available metric id (use only the listed ids, and skip a number you do not have).`,
      );
    return `{{${key}}}`;
  });

  // Look for stray numbers in what is left once the placeholders are removed.
  const bare = text.replace(PLACEHOLDER, " ");
  for (const token of bare.match(/\d+(?:[.,]\d+)*%?/g) ?? []) {
    if (!SMALL_INTEGER.test(token))
      problems.push(
        `${where}: contains the number "${token}". Never type a figure: use a {{metric_id}} placeholder, or write small counts in words.`,
      );
  }
  for (const word of bare.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gi) ?? [])
    problems.push(
      `${where}: the identifier "${word}" appears as a word. Ids go only inside {{ }}; name the metric in plain words.`,
    );
  if (/<[^>]*>/.test(bare))
    problems.push(`${where}: contains markup. Plain text only.`);
  if (/https?:\/\/|www\./i.test(bare))
    problems.push(`${where}: contains a link. Plain text only.`);
  if (ADVICE.test(bare))
    problems.push(
      `${where}: reads as advice. Present arguments to evaluate, never an instruction to buy or sell.`,
    );
  return text;
}

/**
 * Validate the parsed model output against the schema and the integrity rules.
 * `ids` = the metric ids that exist in this company's fact sheet.
 */
export function checkThesis(
  raw: unknown,
  ids: ReadonlySet<string>,
): CheckResult {
  // Some providers do not enforce `maxItems`. Extra glossary ids are harmless (each is checked against an
  // enum by the schema), so trim that one list instead of refusing a good answer. Nothing else is patched.
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as Thesis).glossaryTerms)
  )
    raw = {
      ...(raw as Thesis),
      glossaryTerms: (raw as Thesis).glossaryTerms.slice(0, 6),
    };
  const parsed = ThesisSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues
        .slice(0, 6)
        .map((i) => `${i.path.join(".") || "answer"}: ${i.message}`),
    };
  }
  const problems: string[] = [];
  const src = parsed.data;
  const out: Thesis = {
    ...src,
    glossaryTerms: [...new Set(src.glossaryTerms)],
  };
  for (const f of FIELDS_TEXT) out[f] = checkString(f, src[f], ids, problems);
  for (const f of FIELDS_LIST)
    out[f] = src[f].map((s, i) => checkString(`${f}[${i}]`, s, ids, problems));
  return problems.length > 0
    ? { ok: false, problems: problems.slice(0, 8) }
    : { ok: true, thesis: out };
}

/**
 * Swap each `{{id}}` for its display text. Returns null if any id has no display (the caller then
 * regenerates rather than showing a hole). `displays` should be the CURRENT facts first, with the
 * generation-time facts filling gaps, so the numbers in the text track the page.
 */
export function renderThesis(
  template: Thesis,
  displays: Readonly<Record<string, string>>,
): Thesis | null {
  let missing = false;
  const fill = (s: string) =>
    s.replace(PLACEHOLDER, (_m, id: string) => {
      const d = displays[id.toLowerCase()];
      if (d === undefined) {
        missing = true;
        return "";
      }
      return d;
    });
  const out: Thesis = {
    ...template,
    glossaryTerms: [...template.glossaryTerms],
  };
  for (const f of FIELDS_TEXT) out[f] = fill(template[f]);
  for (const f of FIELDS_LIST) out[f] = template[f].map(fill);
  return missing ? null : out;
}
