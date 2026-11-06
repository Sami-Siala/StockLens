import { describe, expect, it, vi } from "vitest";
import type { GeminiHttpResponse, GeminiTransport } from "@/lib/ai/gemini";
import { GOOD_REPLY, status } from "./helpers";

vi.mock("server-only", () => ({}));

const { GroqClient } = await import("@/lib/ai/groq");
const { RoutingClient, GROQ_PREFIX } = await import("@/lib/ai/router");
const { GeminiError } = await import("@/lib/ai/gemini");

const chat = (content: string, finish = "stop"): GeminiHttpResponse => ({
  status: 200,
  body: { choices: [{ finish_reason: finish, message: { content } }] },
});

function client(answer: () => GeminiHttpResponse | Promise<never>) {
  const bodies: Array<Record<string, unknown>> = [];
  const transport: GeminiTransport = async ({ body }) => {
    bodies.push(body as Record<string, unknown>);
    return answer();
  };
  return { groq: new GroqClient(transport, { timeoutMs: 50 }), bodies };
}

const input = {
  model: "openai/gpt-oss-120b",
  system: "sys",
  user: ["u1", "u2"],
};
const kindOf = async (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e) =>
      e instanceof GeminiError
        ? `${e.kind}${e.daily ? ":daily" : ""}`
        : "other",
  );

describe("Groq client", () => {
  it("sends system + user turns, a json_schema format, and low reasoning for gpt-oss", async () => {
    const { groq, bodies } = client(() => chat(JSON.stringify(GOOD_REPLY)));
    expect(await groq.generateJson(input)).toEqual(GOOD_REPLY);
    const b = bodies[0] as {
      messages: Array<{ role: string; content: string }>;
      response_format: { type: string };
      reasoning_effort?: string;
    };
    expect(b.messages.map((m) => m.role)).toEqual(["system", "user", "user"]);
    expect(b.response_format.type).toBe("json_schema");
    expect(b.reasoning_effort).toBe("low");
  });

  it("does not send reasoning_effort to other models", async () => {
    const { groq, bodies } = client(() => chat("{}"));
    await groq.generateJson({ ...input, model: "qwen/qwen3.8-27b" });
    expect(bodies[0]).not.toHaveProperty("reasoning_effort");
  });

  it("maps failures to typed errors", async () => {
    const cases: Array<[GeminiHttpResponse, string]> = [
      [
        status(429, {
          error: { message: "Limit reached on tokens per minute (TPM)" },
        }),
        "quota",
      ],
      [
        status(429, {
          error: { message: "Limit reached on requests per day (RPD)" },
        }),
        "quota:daily",
      ],
      [status(401), "auth"],
      [status(403), "auth"],
      [status(400, { error: { code: "json_validate_failed" } }), "bad_reply"],
      [status(400, { error: { code: "other" } }), "unavailable"],
      [status(503), "unavailable"],
      [chat("{}", "length"), "bad_reply"],
      [chat(""), "bad_reply"],
      [chat("hello"), "bad_reply"],
    ];
    for (const [res, expected] of cases) {
      const { groq } = client(() => res);
      expect(await kindOf(groq.generateJson(input))).toBe(expected);
    }
  });

  it("times out as 'unavailable'", async () => {
    const transport: GeminiTransport = ({ signal }) =>
      new Promise((_r, reject) =>
        signal.addEventListener("abort", () => reject(new Error("aborted"))),
      );
    const groq = new GroqClient(transport, { timeoutMs: 10 });
    expect(await kindOf(groq.generateJson(input))).toBe("unavailable");
  });
});

describe("routing", () => {
  const fake = (tag: string) => ({
    generateJson: vi.fn(async (i: { model: string }) => ({
      tag,
      model: i.model,
    })),
  });

  it("sends groq: models to Groq (prefix removed) and the rest to Gemini", async () => {
    const gemini = fake("gemini");
    const groq = fake("groq");
    const r = new RoutingClient({ gemini, groq });
    expect(
      await r.generateJson({
        ...input,
        model: `${GROQ_PREFIX}openai/gpt-oss-120b`,
      }),
    ).toEqual({
      tag: "groq",
      model: "openai/gpt-oss-120b",
    });
    expect(
      await r.generateJson({ ...input, model: "gemini-3.6-flash" }),
    ).toEqual({
      tag: "gemini",
      model: "gemini-3.6-flash",
    });
  });

  it("leaves out the models of a provider without a key, and answers 'auth' if called anyway", async () => {
    const r = new RoutingClient({ gemini: fake("gemini") });
    expect(r.availableModels(["gemini-x", "groq:y/z"])).toEqual(["gemini-x"]);
    expect(await kindOf(r.generateJson({ ...input, model: "groq:y/z" }))).toBe(
      "auth",
    );
  });
});
