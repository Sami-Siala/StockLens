/**
 * One-page thesis export (PLAN §5 "Summer challenge thesis", Step 5c). Pure: a document model
 * (already translated and formatted by the caller) goes in, plain text comes out. The print sheet
 * on the stock page renders the very same model as React text nodes, so print and "copy as text"
 * always say the same thing.
 *
 * PLAIN TEXT ONLY. Student notes and AI output are untrusted: they are stripped of control
 * characters and length-capped here, and never become markup anywhere.
 */

export interface ExportRow {
  label: string;
  value: string;
}

export interface ExportColumn {
  title: string;
  items: string[];
}

export interface ExportDoc {
  heading: string;
  company: string;
  /** "NASDAQ:AAPL · USD" */
  identity: string;
  dateLine: string;
  /** null when the price is unavailable. */
  priceLine: string | null;
  keyTitle: string;
  rows: ExportRow[];
  /** Shown instead of the table when `rows` is empty. */
  keyNone: string;
  yourTitle: string;
  pick: ExportRow;
  notes: ExportRow;
  /** null when the student gave no estimate (or its currency no longer matches). */
  estimate: { title: string; lines: string[] } | null;
  /** null unless the AI text is loaded and visible on the page. */
  ai: { title: string; note: string; columns: ExportColumn[] } | null;
  disclaimer: string;
  footer: string;
}

/** Longest single AI or note text taken into an export. */
export const EXPORT_ITEM_MAX = 500;
export const EXPORT_NOTES_MAX = 2000;
/** AI arguments taken per column: the summary stays about one page, and the student's own words come first. */
export const EXPORT_AI_ITEMS = 2;

/**
 * Text that is safe to print or paste: no control characters (tabs and line breaks excepted),
 * CRLF unified, runs of blank lines collapsed, capped. Never HTML-escapes: output is text.
 */
export function plainText(v: unknown, max = EXPORT_ITEM_MAX): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u2028\u2029]/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

const RULE = "-".repeat(40);

/** The whole summary as plain text (what "Copy as text" puts on the clipboard). */
export function buildThesisText(doc: ExportDoc): string {
  const out: string[] = [];
  const section = (title: string) => out.push("", title.toUpperCase(), RULE);

  out.push(doc.heading, RULE, plainText(doc.company, 120), doc.identity);
  out.push(doc.dateLine);
  if (doc.priceLine) out.push(doc.priceLine);

  section(doc.keyTitle);
  if (doc.rows.length === 0) out.push(doc.keyNone);
  for (const r of doc.rows) out.push(`${r.label}: ${r.value}`);

  section(doc.yourTitle);
  out.push(`${doc.pick.label}: ${doc.pick.value}`);
  out.push(`${doc.notes.label}:`);
  out.push(plainText(doc.notes.value, EXPORT_NOTES_MAX) || "-");

  if (doc.estimate) {
    section(doc.estimate.title);
    out.push(...doc.estimate.lines);
  }

  if (doc.ai) {
    section(doc.ai.title);
    out.push(doc.ai.note);
    for (const col of doc.ai.columns) {
      if (col.items.length === 0) continue;
      out.push("", col.title);
      for (const item of col.items) out.push(`- ${plainText(item)}`);
    }
  }

  out.push("", RULE, doc.disclaimer, doc.footer);
  return out.join("\n");
}
