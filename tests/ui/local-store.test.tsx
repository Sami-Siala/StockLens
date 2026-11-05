import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import {
  createListStore,
  useListStore,
  type StorageLike,
} from "@/lib/data/local/store";
import {
  isStarred,
  pushRecent,
  RECENTS_MAX,
  toggleWatch,
  WATCHLIST_MAX,
  type SavedCompany,
} from "@/lib/data/local/lists";

const fake = (): StorageLike & { data: Map<string, string> } => {
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

const co = (symbol: string): SavedCompany => ({
  symbol,
  name: symbol,
  exchange: "X",
});
const make = (storage: StorageLike | null, max = 3) =>
  createListStore<SavedCompany>({
    key: "k",
    max,
    storage: () => storage,
    id: (c) => c.symbol,
    validate: (v) =>
      v &&
      typeof v === "object" &&
      typeof (v as SavedCompany).symbol === "string"
        ? (v as SavedCompany)
        : null,
  });

describe("list store", () => {
  it("round-trips through storage", () => {
    const s = fake();
    const store = make(s);
    store.write([co("A"), co("B")]);
    expect(JSON.parse(s.data.get("k")!)).toHaveLength(2);
    expect(store.read().map((c) => c.symbol)).toEqual(["A", "B"]);
  });
  it("notifies subscribers on write", () => {
    const store = make(fake());
    const fn = vi.fn();
    const off = store.subscribe(fn);
    store.write([co("A")]);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    store.write([]);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("blocked storage: works from memory, never throws", () => {
    const store = make(throwing);
    expect(store.read()).toEqual([]);
    expect(() => store.write([co("A")])).not.toThrow();
    expect(store.read().map((c) => c.symbol)).toEqual(["A"]);
  });
  it("no storage at all (SSR): empty list, writes stay in memory", () => {
    const store = make(null);
    expect(store.read()).toEqual([]);
    store.write([co("A")]);
    expect(store.read()).toHaveLength(1);
  });
  it("corrupt or hostile content is dropped, not trusted", () => {
    const s = fake();
    const store = make(s);
    s.data.set("k", '[1,"x",{"symbol":3},{"symbol":"OK"}]');
    expect(store.read().map((c) => c.symbol)).toEqual(["OK"]);
    for (const raw of ["not json", "{}", "null"]) {
      s.data.set("k", raw);
      expect(store.read()).toEqual([]);
    }
  });
  it("de-duplicates and caps", () => {
    const s = fake();
    s.data.set(
      "k",
      JSON.stringify([co("A"), co("A"), co("B"), co("C"), co("D")]),
    );
    expect(
      make(s)
        .read()
        .map((c) => c.symbol),
    ).toEqual(["A", "B", "C"]);
  });
  it("renders the empty list on the server (hydration-safe)", () => {
    const store = make(fake());
    store.write([co("A")]);
    function Probe() {
      return <p>{useListStore(store).length}</p>;
    }
    expect(renderToString(<Probe />)).toContain(">0<");
  });
});

describe("watchlist and recents rules", () => {
  it("star and un-star", () => {
    const store = make(fake(), WATCHLIST_MAX);
    expect(toggleWatch(co("AAPL"), store)).toBe(true);
    expect(isStarred(store.read(), "aapl")).toBe(true);
    toggleWatch(co("AAPL"), store);
    expect(store.read()).toEqual([]);
  });
  it("refuses a star beyond the limit (keeps one batched call possible)", () => {
    const store = make(fake(), WATCHLIST_MAX);
    store.write(Array.from({ length: WATCHLIST_MAX }, (_, i) => co(`S${i}`)));
    expect(toggleWatch(co("EXTRA"), store)).toBe(false);
    expect(store.read()).toHaveLength(WATCHLIST_MAX);
  });
  it("rejects a malformed symbol", () => {
    const store = make(fake(), WATCHLIST_MAX);
    expect(
      toggleWatch({ symbol: "<script>", name: "x", exchange: "" }, store),
    ).toBe(false);
  });
  it("recents: newest first, no duplicates, capped", () => {
    const store = make(fake(), RECENTS_MAX);
    for (const s of ["A", "B", "C", "A"]) pushRecent(store, co(s));
    expect(store.read().map((c) => c.symbol)).toEqual(["A", "C", "B"]);
    for (const s of "DEFGHIJ") pushRecent(store, co(s));
    expect(store.read()).toHaveLength(RECENTS_MAX);
    expect(store.read()[0].symbol).toBe("J");
  });
});
