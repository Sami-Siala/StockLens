import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/navigation", () => ({
  Link: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: () => {} }),
  usePathname: () => "/",
}));

import { YourTurn } from "@/components/stock/your-turn";
import {
  cleanNote,
  createNotesStore,
  findEntry,
  NOTE_MAX_CHARS,
  NOTES_MAX_ENTRIES,
  saveEntry,
  storageWorks,
} from "@/lib/data/local/notes";
import type { StorageLike } from "@/lib/data/local/store";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { BROKEN, render, visibleText } from "./helpers";

const memory = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};
const throwing: StorageLike = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("quota");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("notes and pick store", () => {
  it("saves a note and a pick per symbol and reads them back", () => {
    const s = memory();
    const store = createNotesStore(() => s);
    expect(saveEntry("aapl", { note: "Makes phones" }, store, 1)).toBe(true);
    expect(saveEntry("AAPL", { pick: "hold" }, store, 2)).toBe(true);
    saveEntry("KO", { pick: "buy" }, store, 3);
    const items = store.read();
    expect(findEntry(items, "AAPL")).toEqual({
      symbol: "AAPL",
      note: "Makes phones",
      pick: "hold",
      updatedAt: 2,
    });
    expect(findEntry(items, "KO")?.note).toBe("");
    // A fresh store over the same storage sees the same data (survives a reload).
    expect(findEntry(createNotesStore(() => s).read(), "AAPL")?.pick).toBe(
      "hold",
    );
  });
  it("a pick change keeps the note, and clearing both removes the entry", () => {
    const store = createNotesStore(() => memory());
    saveEntry("AAPL", { note: "n", pick: "sell" }, store);
    saveEntry("AAPL", { pick: null }, store);
    expect(findEntry(store.read(), "AAPL")).toMatchObject({
      note: "n",
      pick: null,
    });
    saveEntry("AAPL", { note: "   " }, store);
    expect(findEntry(store.read(), "AAPL")).toBeUndefined();
    expect(store.read()).toEqual([]);
  });
  it("caps the note length and the number of companies", () => {
    const store = createNotesStore(() => memory());
    saveEntry("AAPL", { note: "x".repeat(NOTE_MAX_CHARS + 500) }, store);
    expect(findEntry(store.read(), "AAPL")?.note).toHaveLength(NOTE_MAX_CHARS);
    for (let i = 0; i < NOTES_MAX_ENTRIES + 5; i++)
      saveEntry(`S${i}`, { pick: "hold" }, store, i);
    expect(store.read()).toHaveLength(NOTES_MAX_ENTRIES);
    expect(findEntry(store.read(), `S${NOTES_MAX_ENTRIES + 4}`)).toBeDefined();
  });
  it("refuses a malformed symbol", () => {
    const store = createNotesStore(() => memory());
    expect(saveEntry("<script>", { note: "x" }, store)).toBe(false);
    expect(saveEntry("", { note: "x" }, store)).toBe(false);
    expect(store.read()).toEqual([]);
  });
  it("hostile or corrupt stored data is dropped, never trusted", () => {
    const s = memory();
    const store = createNotesStore(() => s);
    s.data.set(
      "stocklens:notes:v1",
      JSON.stringify([
        { symbol: "OK", note: "fine", pick: "hold", updatedAt: 1 },
        { symbol: "<x>", note: "bad symbol", pick: "buy" },
        { symbol: "NOPICK", note: 5, pick: "moon" },
        {
          symbol: "LONG",
          note: "y".repeat(10_000),
          pick: "sell",
          updatedAt: "x",
        },
        "junk",
        null,
      ]),
    );
    const items = store.read();
    expect(items.map((e) => e.symbol)).toEqual(["OK", "LONG"]);
    expect(findEntry(items, "LONG")).toMatchObject({
      pick: "sell",
      updatedAt: 0,
    });
    expect(findEntry(items, "LONG")?.note).toHaveLength(NOTE_MAX_CHARS);
    s.data.set("stocklens:notes:v1", "not json");
    expect(store.read()).toEqual([]);
  });
  it("storage that throws: no crash, the session still remembers", () => {
    const store = createNotesStore(() => throwing);
    expect(store.read()).toEqual([]);
    expect(() =>
      saveEntry("AAPL", { note: "kept in memory", pick: "hold" }, store),
    ).not.toThrow();
    expect(findEntry(store.read(), "AAPL")?.note).toBe("kept in memory");
    expect(storageWorks(throwing)).toBe(false);
  });
  it("no storage at all (SSR): memory only", () => {
    const store = createNotesStore(() => null);
    saveEntry("AAPL", { pick: "sell" }, store);
    expect(findEntry(store.read(), "AAPL")?.pick).toBe("sell");
    expect(storageWorks(null)).toBe(false);
    expect(storageWorks(memory())).toBe(true);
  });
  it("notes stay plain text (a tag-like note is stored as typed, escaped on render)", () => {
    expect(cleanNote("<b>x</b>")).toBe("<b>x</b>");
    expect(cleanNote(42)).toBe("");
  });
});

describe("Your turn box", () => {
  it.each(["en", "fr"] as const)(
    "renders the prompt, notes, three picks, the storage line and the disclaimer (%s)",
    (locale) => {
      const html = render(<YourTurn symbol="AAPL" />, locale);
      const t = visibleText(html);
      expect(t).toContain(locale === "en" ? "Your turn" : "À vous de jouer");
      expect(t).toContain(
        locale === "en"
          ? "Can you explain this business to a 10-year-old?"
          : "Pouvez-vous expliquer ce métier à un enfant de 10 ans ?",
      );
      expect(html).toContain('href="/learn#circle_of_competence"');
      expect(html).toContain("<textarea");
      expect(html).toContain(`maxLength="2000"`);
      expect(html.match(/type="radio"/g)).toHaveLength(3);
      expect(t).toContain(
        locale === "en"
          ? "only stored in this browser"
          : "uniquement dans ce navigateur",
      );
      expect(t).toContain(
        locale === "en"
          ? "Educational content, not financial advice."
          : "Contenu pédagogique, pas un conseil financier.",
      );
      expect(t).not.toMatch(BROKEN);
    },
  );
  it("does not show the blocked-storage warning before it knows", () => {
    expect(visibleText(render(<YourTurn symbol="AAPL" />))).not.toContain(
      "blocking local storage",
    );
  });
});

describe("FR/EN parity and wording of the new namespaces", () => {
  const keys = (node: unknown, prefix = ""): string[] =>
    node && typeof node === "object"
      ? Object.entries(node).flatMap(([k, v]) =>
          keys(v, prefix ? `${prefix}.${k}` : k),
        )
      : [prefix];
  const leaves = (n: unknown): string[] =>
    n && typeof n === "object" ? Object.values(n).flatMap(leaves) : [String(n)];
  const NAMESPACES = ["Turn", "Class", "Dash.assignment", "Footer"] as const;
  const pick = (m: Record<string, unknown>, path: string) =>
    path
      .split(".")
      .reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], m);

  it.each(NAMESPACES)("%s has the same keys in French and English", (ns) => {
    expect(keys(pick(fr, ns)).sort()).toEqual(keys(pick(en, ns)).sort());
  });
  it.each(NAMESPACES)("%s has no empty or broken strings", (ns) => {
    for (const m of [en, fr])
      for (const s of leaves(pick(m, ns))) {
        expect(s.trim()).not.toBe("");
        expect(s).not.toMatch(BROKEN);
      }
  });
  it("no sentence tells the student what to buy (the Buy/Hold/Sell labels are the only such words)", () => {
    const ADVICE =
      /\b(buy|sell|acheter|achetez|achète|vendez|vendre)\b|you should|vous devriez|invest now|investissez/i;
    for (const [lang, m] of [
      ["en", en],
      ["fr", fr],
    ] as const)
      for (const ns of ["Turn", "Class", "Dash.assignment"])
        for (const s of leaves(pick(m, ns))) {
          // The three pick labels are single words ("Buy", "Acheter"); every sentence is checked.
          if (s.split(/\s+/).length === 1) continue;
          expect(s, `${lang} ${ns}`).not.toMatch(ADVICE);
        }
  });
  it("the pick is framed as the student's own argument, not advice", () => {
    expect(en.Turn.pick.hint).toMatch(/not advice/i);
    expect(fr.Turn.pick.hint).toMatch(/pas un conseil/i);
  });
});
