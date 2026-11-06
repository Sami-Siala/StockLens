import { describe, expect, it, vi } from "vitest";
import type { StockSnapshot } from "@/lib/contract";
import { MemoryStore } from "@/lib/providers/cache/memory";
import { ProviderError } from "@/lib/providers/errors";
import {
  fakeGemini,
  GOOD_REPLY,
  loadStock,
  okBody,
  status,
  type Call,
} from "./helpers";

vi.mock("server-only", () => ({}));

const { AiService } = await import("@/lib/ai/service");
const { GeminiClient } = await import("@/lib/ai/gemini");
const { AI_CONFIG, GEMINI_MODELS } = await import("@/lib/ai/config");

const T0 = new Date("2026-11-06T09:00:00Z").getTime();

function setup(
  answer: Parameters<typeof fakeGemini>[0],
  opts: { stock?: StockSnapshot; key?: boolean } = {},
) {
  const clock = { t: T0 };
  const store = new MemoryStore(() => clock.t);
  const fake = fakeGemini(answer);
  const stock = { current: opts.stock ?? loadStock("AAPL") };
  const service = new AiService({
    store,
    getStock: async () => stock.current,
    gemini: opts.key === false ? null : new GeminiClient(fake.transport),
    now: () => clock.t,
    sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 2))),
    cache: { pollMs: 2, waitMs: 3000 },
  });
  return { service, store, clock, stock, ...fake };
}

const ready = (
  r: Awaited<ReturnType<InstanceType<typeof AiService>["getThesis"]>>,
) => {
  if (r.result.status !== "ready")
    throw new Error(`not ready: ${r.result.reason}`);
  return r.result.thesis;
};
const reason = (
  r: Awaited<ReturnType<InstanceType<typeof AiService>["getThesis"]>>,
) => (r.result.status === "unavailable" ? r.result.reason : "ready");

describe("happy path", () => {
  it("generates once, renders the page's numbers, then serves from cache", async () => {
    const s = setup(() => okBody(GOOD_REPLY));
    const a = await s.service.getThesis("AAPL", "en");
    expect(a.meta).toMatchObject({
      contractVersion: "0.4.0",
      language: "en",
      model: GEMINI_MODELS[0],
      stale: false,
    });
    const t = ready(a);
    expect(t.bullCase[0]).toMatch(/P\/E of \d/);
    expect(JSON.stringify(t)).not.toContain("{{");

    await s.service.getThesis("AAPL", "en");
    expect(s.calls).toHaveLength(1);
    // another language is a separate generation
    await s.service.getThesis("AAPL", "fr");
    expect(s.calls).toHaveLength(2);
    expect(s.calls[1].body.systemInstruction.parts[0].text).toMatch(/French/);
  });

  it("keeps the key out of the request body and asks for schema-enforced JSON", async () => {
    const s = setup(() => okBody(GOOD_REPLY));
    await s.service.getThesis("AAPL", "en");
    const body = JSON.stringify(s.calls[0].body);
    expect(body).not.toMatch(/api[_-]?key/i);
    expect(body).toContain("responseJsonSchema");
  });

  it("15 students opening one ticker at once cause ONE Gemini call", async () => {
    const s = setup(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return okBody(GOOD_REPLY);
    });
    const all = await Promise.all(
      Array.from({ length: 15 }, () => s.service.getThesis("AAPL", "en")),
    );
    expect(all.every((r) => r.result.status === "ready")).toBe(true);
    expect(s.calls).toHaveLength(1);
  });

  it("keeps the text's numbers in step with the page between regenerations", async () => {
    const s = setup(() => okBody(GOOD_REPLY));
    const first = ready(await s.service.getThesis("AAPL", "en"));
    const moved = structuredClone(s.stock.current);
    moved.fundamentals.value!.keyStats.trailingPE = {
      value: 99.9,
      reason: null,
    };
    s.stock.current = moved;
    const second = ready(await s.service.getThesis("AAPL", "en"));
    expect(s.calls).toHaveLength(1);
    expect(first.bullCase[0]).not.toContain("99.9");
    expect(second.bullCase[0]).toContain("99.9");
  });

  it("falls back to the stored number when a metric disappears from the page", async () => {
    const s = setup(() => okBody(GOOD_REPLY));
    await s.service.getThesis("AAPL", "en");
    const gone = structuredClone(s.stock.current);
    gone.fundamentals.value!.keyStats.trailingPE = {
      value: null,
      reason: "provider_error",
    };
    s.stock.current = gone;
    const t = ready(await s.service.getThesis("AAPL", "en"));
    expect(t.bullCase[0]).toMatch(/P\/E of \d/);
  });
});

describe("refused answers and fallbacks", () => {
  it("retries the same model once, telling it what was wrong", async () => {
    const bad = {
      ...GOOD_REPLY,
      keyRisks: ["Margins grew 12% last year.", "Fine."],
    };
    const s = setup((_c, n) => okBody(n === 0 ? bad : GOOD_REPLY));
    expect(ready(await s.service.getThesis("AAPL", "en"))).toBeDefined();
    expect(s.calls).toHaveLength(2);
    expect(s.calls[1].model).toBe(s.calls[0].model);
    expect(s.calls[1].body.contents).toHaveLength(2);
    expect(s.calls[1].body.contents[1].parts[0].text).toMatch(/12%/);
  });

  it("moves to the next model when one is down", async () => {
    const s = setup((c: Call) =>
      c.model === GEMINI_MODELS[0] ? status(503) : okBody(GOOD_REPLY),
    );
    const r = await s.service.getThesis("AAPL", "en");
    expect(r.meta.model).toBe(GEMINI_MODELS[1]);
    expect(s.calls.map((c) => c.model)).toEqual([
      GEMINI_MODELS[0],
      GEMINI_MODELS[1],
    ]);
  });

  it("moves to the next model on a per-model 429 and still succeeds", async () => {
    const s = setup((c: Call) =>
      c.model === GEMINI_MODELS[0]
        ? status(429, { error: { status: "RESOURCE_EXHAUSTED" } })
        : okBody(GOOD_REPLY),
    );
    expect((await s.service.getThesis("AAPL", "en")).meta.model).toBe(
      GEMINI_MODELS[1],
    );
  });

  it("reports model_error (not a crash) when every model keeps refusing", async () => {
    const bad = { ...GOOD_REPLY, whatItDoes: "<script>alert(1)</script>" };
    const s = setup(() => okBody(bad));
    const r = await s.service.getThesis("AAPL", "en");
    expect(reason(r)).toBe("model_error");
    expect(s.calls).toHaveLength(
      GEMINI_MODELS.length * (AI_CONFIG.retriesPerModel + 1),
    );
  });

  it("never shows a blocked, truncated or non-JSON reply", async () => {
    for (const body of [
      { promptFeedback: { blockReason: "SAFETY" } },
      {
        candidates: [
          { finishReason: "MAX_TOKENS", content: { parts: [{ text: "{" }] } },
        ],
      },
      {
        candidates: [
          { finishReason: "STOP", content: { parts: [{ text: "hello" }] } },
        ],
      },
    ]) {
      const s = setup(() => ({ status: 200, body }));
      expect(reason(await s.service.getThesis("AAPL", "en"))).toBe(
        "model_error",
      );
    }
  });
});

describe("quota and keys", () => {
  const quota = (detail = "PerMinute") =>
    status(429, {
      error: {
        status: "RESOURCE_EXHAUSTED",
        message: detail,
        details: [detail],
      },
    });

  it("all models out of quota -> quota_exhausted with retryAfter, then no more calls during the cooldown", async () => {
    const s = setup(() => quota());
    const r = await s.service.getThesis("AAPL", "en");
    expect(r.result).toMatchObject({
      status: "unavailable",
      reason: "quota_exhausted",
      retryAfter: AI_CONFIG.quotaCooldownSeconds,
    });
    const used = s.calls.length;
    expect(used).toBe(GEMINI_MODELS.length);
    s.clock.t += 20_000; // past the 10 s failure cooldown, inside the quota cooldown
    expect(reason(await s.service.getThesis("AAPL", "en"))).toBe(
      "quota_exhausted",
    );
    expect(s.calls).toHaveLength(used);
    s.clock.t += AI_CONFIG.quotaCooldownSeconds * 1000;
    expect(reason(await s.service.getThesis("AAPL", "en"))).toBe(
      "quota_exhausted",
    );
    expect(s.calls.length).toBeGreaterThan(used); // it tried again once the cooldown ended
  });

  it("a per-day quota waits much longer", async () => {
    const s = setup(() => quota("RequestsPerDay"));
    const r = await s.service.getThesis("AAPL", "en");
    expect(r.result).toMatchObject({
      retryAfter: AI_CONFIG.dailyQuotaCooldownSeconds,
    });
  });

  it("a model that hit its daily limit is skipped for the next generations (no wasted calls)", async () => {
    const s = setup((c: Call) =>
      c.model === GEMINI_MODELS[0]
        ? quota("RequestsPerDay")
        : okBody(GOOD_REPLY),
    );
    expect((await s.service.getThesis("AAPL", "en")).meta.model).toBe(
      GEMINI_MODELS[1],
    );
    const first = s.calls.filter((c: Call) => c.model === GEMINI_MODELS[0]);
    expect(first).toHaveLength(1);
    expect((await s.service.getThesis("AAPL", "fr")).meta.model).toBe(
      GEMINI_MODELS[1],
    );
    expect(
      s.calls.filter((c: Call) => c.model === GEMINI_MODELS[0]),
    ).toHaveLength(1); // still 1: the spent model was not called again
  });

  it("our own daily budget stops generations before Google does", async () => {
    const s = setup(() => okBody(GOOD_REPLY));
    for (let i = 0; i < AI_CONFIG.dailyGenerationBudget; i++)
      await s.store.increment("ai:budget:2026-11-06", 3600);
    expect(reason(await s.service.getThesis("AAPL", "en"))).toBe(
      "quota_exhausted",
    );
    expect(s.calls).toHaveLength(0);
  });

  it("no key -> no_key, and the stock page data is untouched", async () => {
    const s = setup(() => okBody(GOOD_REPLY), { key: false });
    expect(reason(await s.service.getThesis("AAPL", "en"))).toBe("no_key");
    expect(await s.service.health()).toMatchObject({
      name: "gemini",
      status: "down",
    });
  });

  it("a rejected key (401/403/400 key invalid) is no_key, with one attempt per model and no retries", async () => {
    for (const res of [
      status(403),
      status(401),
      status(400, { error: { message: "API key not valid." } }),
    ]) {
      const s = setup(() => res);
      expect(reason(await s.service.getThesis("AAPL", "en"))).toBe("no_key");
      expect(s.calls).toHaveLength(GEMINI_MODELS.length);
    }
  });
});

describe("not an explainable company", () => {
  it("an ETF is not applicable and costs no Gemini call", async () => {
    const s = setup(() => okBody(GOOD_REPLY), { stock: loadStock("SPY") });
    expect(reason(await s.service.getThesis("SPY", "en"))).toBe(
      "not_applicable_for_type",
    );
    expect(s.calls).toHaveLength(0);
  });

  it("a company with almost no data is refused instead of letting the model guess", async () => {
    const thin = structuredClone(loadStock("AAPL"));
    thin.fundamentals = { value: null, reason: "provider_error" };
    thin.earnings = { value: null, reason: "provider_error" };
    thin.analysts = { value: null, reason: "provider_error" };
    const s = setup(() => okBody(GOOD_REPLY), { stock: thin });
    expect(reason(await s.service.getThesis("AAPL", "en"))).toBe(
      "insufficient_data",
    );
    expect(s.calls).toHaveLength(0);
  });

  it("lets a market-data failure through so the route can answer 404/502", async () => {
    const clock = { t: T0 };
    const service = new AiService({
      store: new MemoryStore(() => clock.t),
      getStock: async () => {
        throw new ProviderError("not_found", "nope");
      },
      gemini: null,
    });
    await expect(service.getThesis("ZZZZ", "en")).rejects.toMatchObject({
      kind: "not_found",
    });
  });
});

describe("stale copy and health", () => {
  it("serves yesterday's text, flagged stale, when regeneration fails", async () => {
    let down = false;
    const s = setup(() => (down ? status(503) : okBody(GOOD_REPLY)));
    const first = await s.service.getThesis("AAPL", "en");
    expect(first.meta.stale).toBe(false);
    down = true;
    s.clock.t += (AI_CONFIG.softTtlSeconds + 60) * 1000;
    const again = await s.service.getThesis("AAPL", "en");
    expect(again.meta.stale).toBe(true);
    expect(ready(again).whatItDoes).toBe(ready(first).whatItDoes);
  });

  it("health: ok after a success, degraded then down after repeated failures", async () => {
    let fail = false;
    const s = setup(() => (fail ? status(503) : okBody(GOOD_REPLY)));
    await s.service.getThesis("AAPL", "en");
    expect(await s.service.health()).toMatchObject({
      name: "gemini",
      status: "ok",
    });
    fail = true;
    for (let i = 0; i < 3; i++) {
      s.clock.t += (AI_CONFIG.softTtlSeconds + 60) * 1000;
      await s.service.getThesis("AAPL", "en");
    }
    expect((await s.service.health()).status).toBe("down");
  });
});

describe("GeminiClient transport", () => {
  it("turns a hung call into a timeout failure", async () => {
    const client = new GeminiClient(
      ({ signal }) =>
        new Promise((_res, rej) =>
          signal.addEventListener("abort", () => rej(new Error("aborted"))),
        ),
      { timeoutMs: 20 },
    );
    await expect(
      client.generateJson({ model: "m", system: "s", user: ["u"] }),
    ).rejects.toMatchObject({ kind: "unavailable", message: "timeout" });
  });

  it("puts the key in a header, never in the URL, and never leaks it in an error", async () => {
    const { fetchTransport } = await import("@/lib/ai/gemini");
    const seen: Array<{ url: string; headers: Record<string, string> }> = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      seen.push({ url, headers: init.headers as Record<string, string> });
      return new Response(JSON.stringify({ error: { message: "bad" } }), {
        status: 500,
      });
    }) as typeof fetch;
    try {
      const client = new GeminiClient(fetchTransport("SECRET-KEY"));
      const err = await client
        .generateJson({ model: "gemini-x", system: "s", user: ["u"] })
        .catch((e: Error) => e);
      expect(seen[0].url).toBe(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent",
      );
      expect(seen[0].url).not.toContain("SECRET");
      expect(seen[0].headers["x-goog-api-key"]).toBe("SECRET-KEY");
      expect(String((err as Error).message)).not.toContain("SECRET");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("several providers", () => {
  it("a rejected key on one provider only skips its models; the next one answers", async () => {
    const s = setup((c: Call) =>
      c.model === GEMINI_MODELS[0] ? status(403) : okBody(GOOD_REPLY),
    );
    const r = await s.service.getThesis("AAPL", "en");
    expect(r.meta.model).toBe(GEMINI_MODELS[1]);
    expect(
      s.calls.filter((c: Call) => c.model === GEMINI_MODELS[0]),
    ).toHaveLength(1);
  });
});
