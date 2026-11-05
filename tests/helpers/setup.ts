import { FakeYahooClient } from "./fake-yahoo";
import { MemoryStore } from "@/lib/providers/cache/memory";
import { DataService } from "@/lib/providers/service";
import { YahooProvider } from "@/lib/providers/yahoo";

/*
 * NOTE: `server-only` throws outside Next's react-server condition, so every test file that
 * (transitively) imports lib/providers starts with   vi.mock("server-only", () => ({}));
 * (vi.mock must sit at the top level of the test file; Vitest hoists it above the imports).
 */

/** When the raw payloads were recorded (Thu 5 Nov 2026 ~20:30 UTC). Used as "now" in tests. */
export const RECORDED_AT = new Date("2026-11-05T20:30:00Z");

/** A fully wired service over recorded payloads, with a controllable clock. */
export function makeService(
  opts: {
    client?: FakeYahooClient;
    store?: MemoryStore;
    clock?: { t: number };
    cache?: { waitMs?: number; pollMs?: number };
  } = {},
) {
  const clock = opts.clock ?? { t: RECORDED_AT.getTime() };
  const client = opts.client ?? new FakeYahooClient();
  const store = opts.store ?? new MemoryStore(() => clock.t);
  const service = new DataService({
    provider: new YahooProvider(client, () => new Date(clock.t)),
    store,
    now: () => clock.t,
    sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5))),
    cache: { pollMs: 5, waitMs: 2000, ...opts.cache },
  });
  return { service, client, store, clock };
}
