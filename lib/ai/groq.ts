import "server-only";
import { AI_CONFIG } from "./config";
import {
  GeminiError,
  type GenerateInput,
  type GeminiHttpResponse,
  type GeminiTransport,
} from "./gemini";
import { THESIS_JSON_SCHEMA } from "./schema";

/**
 * Groq client (OpenAI-compatible chat completions). Same contract as `GeminiClient`: ONE model call
 * in, parsed JSON out or a typed `GeminiError` (the error type is shared, its kinds are provider
 * neutral). The transport is injectable so every failure path is tested without a key.
 *
 * Measured live 2026-11-06 (free tier): 1000 requests/day per model, 8000 tokens/minute. `json_schema`
 * response format works on openai/gpt-oss-120b, openai/gpt-oss-20b and qwen/qwen3.8-27b.
 */

export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

/** Same shape as the Gemini transport: tests reuse the same fakes. */
export type GroqTransport = GeminiTransport;

export const groqFetchTransport =
  (apiKey: string): GroqTransport =>
  async ({ body, signal }) => {
    const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    });
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      /* non-JSON body: the status code is enough */
    }
    return { status: res.status, body: parsed };
  };

interface GroqReply {
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string | null };
  }>;
  error?: { message?: string; code?: string; type?: string };
}

const asReply = (b: unknown): GroqReply =>
  b && typeof b === "object" ? (b as GroqReply) : {};

export class GroqClient {
  constructor(
    private transport: GroqTransport,
    private opts: { timeoutMs?: number } = {},
  ) {}

  async generateJson(input: GenerateInput): Promise<unknown> {
    const body = {
      model: input.model,
      messages: [
        { role: "system", content: input.system },
        ...input.user.map((content) => ({ role: "user", content })),
      ],
      temperature: AI_CONFIG.temperature,
      max_completion_tokens: AI_CONFIG.maxOutputTokens,
      response_format: {
        type: "json_schema",
        json_schema: { name: "thesis", schema: THESIS_JSON_SCHEMA },
      },
      // gpt-oss reasons before it answers; the facts are supplied, so keep that short.
      ...(input.model.includes("gpt-oss") ? { reasoning_effort: "low" } : {}),
    };

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.opts.timeoutMs ?? AI_CONFIG.requestTimeoutMs,
    );
    let res: GeminiHttpResponse;
    try {
      res = await this.transport({
        model: input.model,
        body,
        signal: controller.signal,
      });
    } catch (e) {
      throw new GeminiError(
        "unavailable",
        controller.signal.aborted
          ? "timeout"
          : e instanceof Error
            ? e.name.slice(0, 40)
            : "error",
      );
    } finally {
      clearTimeout(timer);
    }
    return parseGroqReply(res);
  }
}

/** Never put upstream text in the message: it may echo the prompt. Status and a short code only. */
function parseGroqReply(res: GeminiHttpResponse): unknown {
  const reply = asReply(res.body);
  if (res.status === 429) {
    // Groq names the limit in the message: "...tokens per minute (TPM)...", "...requests per day (RPD)...".
    const detail = reply.error?.message ?? "";
    throw new GeminiError(
      "quota",
      "429",
      /per day|\bRPD\b|\bTPD\b/i.test(detail),
    );
  }
  if (res.status === 401 || res.status === 403)
    throw new GeminiError("auth", String(res.status));
  // The model produced JSON that broke the schema: worth one more try, like any unusable reply.
  if (res.status === 400 && reply.error?.code === "json_validate_failed")
    throw new GeminiError("bad_reply", "schema");
  if (res.status >= 400)
    throw new GeminiError("unavailable", String(res.status));

  const choice = reply.choices?.[0];
  if (choice?.finish_reason && choice.finish_reason !== "stop")
    throw new GeminiError("bad_reply", `finish ${choice.finish_reason}`);
  const text = choice?.message?.content ?? "";
  if (!text.trim()) throw new GeminiError("bad_reply", "empty");
  try {
    return JSON.parse(text);
  } catch {
    throw new GeminiError("bad_reply", "not json");
  }
}
