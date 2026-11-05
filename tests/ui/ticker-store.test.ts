import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TickerResponse } from "@/lib/contract";
import { DataError } from "@/lib/data/errors";
import { createTickerStore } from "@/lib/data/ticker-store";
import { loadTicker } from "./helpers";

const data = loadTicker();
const MIN = 60_000;

function setup(
  overrides: Partial<{
    fetcher: () => Promise<TickerResponse>;
    hidden: boolean;
  }> = {},
) {
  let clock = 1_000_000;
  const state = { hidden: overrides.hidden ?? false };
  let visible: (() => void) | null = null;
  const fetcher = vi.fn(overrides.fetcher ?? (() => Promise.resolve(data)));
  const store = createTickerStore({
    fetcher,
    now: () => clock,
    isHidden: () => state.hidden,
    onVisible: (cb) => {
      visible = cb;
      return () => {
        visible = null;
      };
    },
  });
  return {
    store,
    fetcher,
    state,
    advance(ms: number) {
      clock += ms;
      vi.advanceTimersByTime(ms);
    },
    showTab: () => visible?.(),
  };
}

describe("shared ticker store", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("one request for any number of subscribers, and none once data is fresh", async () => {
    const { store, fetcher } = setup();
    const a = store.subscribe(() => {});
    const b = store.subscribe(() => {});
    expect(fetcher).toHaveBeenCalledTimes(1);
    await store.refreshIfStale();
    expect(store.getSnapshot()).toMatchObject({ status: "ready" });
    // a page change: the old band unmounts, the new one mounts straight away
    a();
    b();
    const c = store.subscribe(() => {});
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toMatchObject({ status: "ready", data });
    c();
  });

  it("StrictMode style mount / unmount / mount shares the in-flight request", () => {
    const { store, fetcher } = setup();
    store.subscribe(() => {})();
    store.subscribe(() => {});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refreshes about once a minute while someone is subscribed, never faster", async () => {
    const { store, fetcher, advance } = setup();
    store.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    advance(30_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    advance(MIN);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
    advance(MIN);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("stops polling when nobody is subscribed", async () => {
    const { store, fetcher, advance } = setup();
    const off = store.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    off();
    advance(5 * MIN);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not refresh while the tab is hidden, and catches up when it is shown again", async () => {
    const { store, fetcher, state, advance, showTab } = setup();
    store.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    state.hidden = true;
    advance(3 * MIN);
    expect(fetcher).toHaveBeenCalledTimes(1);
    state.hidden = false;
    showTab();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
    showTab(); // already fresh
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("the very first request is made even in a hidden tab", () => {
    const { store, fetcher } = setup({ hidden: true });
    store.subscribe(() => {});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("a failed first load ends in `error` and retries only after the interval", async () => {
    const { store, fetcher, advance } = setup({
      fetcher: () => Promise.reject(new DataError("upstream_unavailable")),
    });
    store.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot()).toMatchObject({ status: "error" });
    await store.refreshIfStale();
    expect(fetcher).toHaveBeenCalledTimes(1);
    advance(MIN);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("a failed refresh keeps the data on screen", async () => {
    let calls = 0;
    const { store, advance } = setup({
      fetcher: () =>
        ++calls === 1
          ? Promise.resolve(data)
          : Promise.reject(new DataError("network")),
    });
    store.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    advance(MIN);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(2);
    expect(store.getSnapshot()).toMatchObject({ status: "ready", data });
  });

  it("notifies subscribers and hands out a stable snapshot between changes", async () => {
    const { store } = setup();
    const listener = vi.fn();
    store.subscribe(listener);
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    await vi.advanceTimersByTimeAsync(0);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).not.toBe(first);
  });
});
