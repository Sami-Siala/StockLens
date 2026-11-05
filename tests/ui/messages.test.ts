import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

function keys(node: unknown, prefix = ""): string[] {
  if (node && typeof node === "object")
    return Object.entries(node).flatMap(([k, v]) =>
      keys(v, prefix ? `${prefix}.${k}` : k),
    );
  return [prefix];
}

describe("messages", () => {
  it("fr and en have exactly the same keys", () => {
    expect(keys(fr).sort()).toEqual(keys(en).sort());
  });
  it("no empty strings", () => {
    const leaves = (n: unknown): string[] =>
      n && typeof n === "object"
        ? Object.values(n).flatMap(leaves)
        : [String(n)];
    for (const m of [en, fr])
      expect(leaves(m).filter((v) => v.trim() === "")).toEqual([]);
  });
  it("covers every unavailable reason in both languages", () => {
    const reasons = [
      "not_applicable_for_type",
      "negative_earnings",
      "not_reported",
      "reported_less_often",
      "not_provided_by_source",
      "currency_mismatch",
      "provider_error",
    ];
    for (const m of [en, fr])
      expect(Object.keys(m.Stock.reasons).sort()).toEqual([...reasons].sort());
  });
});
