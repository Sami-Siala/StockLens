import "server-only";
import { AI_CONFIG, GEMINI_BASE_URL } from "./config";
import { THESIS_JSON_SCHEMA } from "./schema";

/**
 * Minimal Gemini REST client (no SDK: one fewer dependency, and the transport is injectable so every
 * failure path can be tested without a key). The model fallback chain lives in service.ts; this file
 * only turns ONE model call into text or a typed failure.
 *
 * NOTE (Step 4b): the request shape follows Google's public REST docs (`generateContent`,
 * `responseJsonSchema`) but has not been exercised against the live API yet, there is no key. 4b does.
 */

export type GeminiFailure =
  /** 429: out of requests for this model (per minute or per day). */
  | "quota"
  /** 401/403, or 400 "API key not valid": the key is missing, wrong or revoked. */
  | "auth"
  /** Timeout, network error, 5xx, 404 (model gone). Another model may still work. */
  | "unavailable"
  /** The reply was blocked, cut off or not JSON. */
  | "bad_reply";

export class GeminiError extends Error {
  constructor(
    readonly kind: GeminiFailure,
    message: string,
    /** For `quota`: true when the message names a per-day limit. */
    readonly daily = false,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

/** What the transport returns. Tests supply their own; production uses `fetchTransport`. */
export interface GeminiHttpResponse {
  status: number;
  body: unknown;
}
export type GeminiTransport = (req: {
  model: string;
  body: unknown;
  signal: AbortSignal;
}) => Promise<GeminiHttpResponse>;

export const fetchTransport =
  (apiKey: string): GeminiTransport =>
  async ({ model, body, signal }) => {
    const res = await fetch(
      `${GEMINI_BASE_URL}/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        // The key goes in a header, never in the URL (URLs end up in logs).
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(body),
        signal,
        cache: "no-store",
      },
    );
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      /* non-JSON body: the status code is enough */
    }
    return { status: res.status, body: parsed };
  };

interface GeminiReply {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string; details?: unknown };
}

const asReply = (b: unknown): GeminiReply =>
  b && typeof b === "object" ? (b as GeminiReply) : {};

export interface GenerateInput {
  model: string;
  system: string;
  /** One or more user turns, in order (the second is the retry note). */
  user: string[];
}

export class GeminiClient {
  constructor(
    private transport: GeminiTransport,
    private opts: { timeoutMs?: number } = {},
  ) {}

  /** One call to one model. Returns the model's JSON, parsed. Throws `GeminiError`. */
  async generateJson(input: GenerateInput): Promise<unknown> {
    const body = {
      systemInstruction: { parts: [{ text: input.system }] },
      contents: input.user.map((text) => ({
        role: "user",
        parts: [{ text }],
      })),
      generationConfig: {
        temperature: AI_CONFIG.temperature,
        maxOutputTokens: AI_CONFIG.maxOutputTokens,
        responseMimeType: "application/json",
        responseJsonSchema: THESIS_JSON_SCHEMA,
      },
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
        controller.signal.aborted ? "timeout" : errorName(e),
      );
    } finally {
      clearTimeout(timer);
    }
    return parseReply(res);
  }
}

/** Never put upstream text in the message: it may echo the prompt. Status and a short code only. */
function errorName(e: unknown): string {
  return e instanceof Error ? e.name.slice(0, 40) : "error";
}

function parseReply(res: GeminiHttpResponse): unknown {
  const reply = asReply(res.body);
  const status = reply.error?.status ?? "";
  if (res.status === 429 || status === "RESOURCE_EXHAUSTED") {
    // Google names the limit that was hit ("...PerDay...", "...PerMinute...") in the error details.
    const detail = JSON.stringify(reply.error ?? {});
    throw new GeminiError("quota", "429", /PerDay|per day/i.test(detail));
  }
  if (res.status === 401 || res.status === 403)
    throw new GeminiError("auth", String(res.status));
  if (res.status === 400 && /API[_ ]KEY/i.test(reply.error?.message ?? status))
    throw new GeminiError("auth", "400 key");
  if (res.status >= 400)
    throw new GeminiError("unavailable", String(res.status));

  if (reply.promptFeedback?.blockReason)
    throw new GeminiError("bad_reply", "blocked");
  const cand = reply.candidates?.[0];
  if (
    cand?.finishReason &&
    !["STOP", "FINISH_REASON_UNSPECIFIED"].includes(cand.finishReason)
  )
    throw new GeminiError("bad_reply", `finish ${cand.finishReason}`);
  const text = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new GeminiError("bad_reply", "empty");
  try {
    return JSON.parse(text);
  } catch {
    throw new GeminiError("bad_reply", "not json");
  }
}
