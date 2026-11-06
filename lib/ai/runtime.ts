import "server-only";
import { getStore } from "@/lib/providers/cache";
import { getService } from "@/lib/providers/runtime";
import { fetchTransport, GeminiClient } from "./gemini";
import { AiService } from "./service";

const g = globalThis as unknown as { __stocklensAi?: AiService };

/** The process-wide AI service (one in-flight map per instance, like `getService()`). */
export function getAiService(): AiService {
  if (!g.__stocklensAi) {
    const key = process.env.GEMINI_API_KEY?.trim();
    g.__stocklensAi = new AiService({
      store: getStore(),
      getStock: (symbol) => getService().getStock(symbol),
      gemini: key ? new GeminiClient(fetchTransport(key)) : null,
    });
  }
  return g.__stocklensAi;
}
