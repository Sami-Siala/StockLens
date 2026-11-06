import "server-only";
import { GeminiError, type GenerateInput } from "./gemini";

/** Anything that turns ONE (model, prompt) into parsed JSON or a typed `GeminiError`. */
export interface ThesisClient {
  generateJson(input: GenerateInput): Promise<unknown>;
}

/** Chain entries for Groq look like `groq:openai/gpt-oss-120b`; anything else is a Gemini API model. */
export const GROQ_PREFIX = "groq:";

/**
 * Sends each chain entry to the provider that owns it. A provider with no key is simply absent: its
 * models answer `auth`, and the service skips them (use `availableModels` to leave them out up front).
 */
export class RoutingClient implements ThesisClient {
  constructor(
    private providers: { gemini?: ThesisClient; groq?: ThesisClient },
  ) {}

  availableModels(models: readonly string[]): string[] {
    return models.filter((m) =>
      m.startsWith(GROQ_PREFIX)
        ? !!this.providers.groq
        : !!this.providers.gemini,
    );
  }

  generateJson(input: GenerateInput): Promise<unknown> {
    const isGroq = input.model.startsWith(GROQ_PREFIX);
    const client = isGroq ? this.providers.groq : this.providers.gemini;
    if (!client) return Promise.reject(new GeminiError("auth", "no key"));
    return client.generateJson(
      isGroq
        ? { ...input, model: input.model.slice(GROQ_PREFIX.length) }
        : input,
    );
  }
}
