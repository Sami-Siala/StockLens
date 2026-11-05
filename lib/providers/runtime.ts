import "server-only";
import { getStore } from "./cache";
import { DataService } from "./service";
import { YahooProvider } from "./yahoo";
import { createYahooClient } from "./yahoo-client";

const g = globalThis as unknown as { __stocklensService?: DataService };

/**
 * The process-wide service used by the route handlers. Kept on `globalThis` so every route
 * bundle (and dev-server hot reloads) share ONE instance: one in-flight map, one cookie jar.
 */
export function getService(): DataService {
  if (!g.__stocklensService) {
    const store = getStore();
    g.__stocklensService = new DataService({
      provider: new YahooProvider(createYahooClient(store)),
      store,
    });
  }
  return g.__stocklensService;
}
