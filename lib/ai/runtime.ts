import "server-only";
import { getStore } from "@/lib/providers/cache";
import { getService } from "@/lib/providers/runtime";
import { GEMINI_MODELS } from "./config";
import { fetchTransport, GeminiClient } from "./gemini";
import { GroqClient, groqFetchTransport } from "./groq";
import { RoutingClient } from "./router";
import { AiService } from "./service";

const g = globalThis as unknown as { __stocklensAi?: AiService };

/**
 * The process-wide AI service (one in-flight map per instance, like `getService()`). Providers whose
 * key is absent are left out of the chain; with no key at all the service answers `no_key`.
 */
export function getAiService(): AiService {
  if (!g.__stocklensAi) {
    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    const groqKey = process.env.GROQ_API_KEY?.trim();
    const router = new RoutingClient({
      gemini: geminiKey
        ? new GeminiClient(fetchTransport(geminiKey))
        : undefined,
      groq: groqKey ? new GroqClient(groqFetchTransport(groqKey)) : undefined,
    });
    const models = router.availableModels(GEMINI_MODELS);
    g.__stocklensAi = new AiService({
      store: getStore(),
      getStock: (symbol) => getService().getStock(symbol),
      gemini: models.length ? router : null,
      models,
    });
  }
  return g.__stocklensAi;
}
