/**
 * LIVE Gemini check (Step 4b). Opt-in, needs GEMINI_API_KEY in .env.local, never part of `npm test`.
 *
 *   npx tsx scripts/ai-live.ts AAPL                    # every model of the chain, FR and EN
 *   npx tsx scripts/ai-live.ts AAPL --lang fr --model groq:openai/gpt-oss-120b
 *   npx tsx scripts/ai-live.ts AAPL --show             # also print the rendered thesis
 *
 * Calls ONE model at a time (no fallback) and prints latency, finish reason and the exact reasons the
 * integrity gate refuses an answer, which the service otherwise swallows. Real Yahoo data, in-process.
 */
import "./shim-server-only";
import { readFileSync } from "node:fs";
import { MemoryStore } from "../lib/providers/cache/memory";
import { DataService } from "../lib/providers/service";
import { YahooProvider } from "../lib/providers/yahoo";
import { createYahooClient } from "../lib/providers/yahoo-client";
import { GEMINI_MODELS } from "../lib/ai/config";
import { buildFacts, displayMap } from "../lib/ai/facts";
import { fetchTransport, GeminiClient, GeminiError } from "../lib/ai/gemini";
import { GroqClient, groqFetchTransport } from "../lib/ai/groq";
import { RoutingClient } from "../lib/ai/router";
import { checkThesis, renderThesis } from "../lib/ai/integrity";
import { systemPrompt, userPrompt } from "../lib/ai/prompt";

function loadEnvLocal() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]])
        process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch {
    /* no .env.local */
  }
}

async function main() {
  loadEnvLocal();
  const args = process.argv.slice(2);
  const flag = (n: string) => {
    const i = args.indexOf(`--${n}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const show = args.includes("--show");
  const symbols = args.filter(
    (a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"),
  );
  const langs = flag("lang")
    ? [flag("lang") as "fr" | "en"]
    : (["en", "fr"] as const);
  const models = flag("model") ? [flag("model")!] : [...GEMINI_MODELS];
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!geminiKey && !groqKey) throw new Error("No key in .env.local");
  const gemini = new RoutingClient({
    gemini: geminiKey
      ? new GeminiClient(fetchTransport(geminiKey), { timeoutMs: 60_000 })
      : undefined,
    groq: groqKey
      ? new GroqClient(groqFetchTransport(groqKey), { timeoutMs: 60_000 })
      : undefined,
  });

  const store = new MemoryStore();
  const service = new DataService({
    provider: new YahooProvider(createYahooClient(store)),
    store,
  });

  for (const symbol of symbols.length ? symbols : ["AAPL"]) {
    const stock = await service.getStock(symbol);
    for (const lang of langs) {
      const sheet = buildFacts(stock, lang);
      const ids = new Set(Object.keys(sheet.facts));
      for (const model of models) {
        const t0 = Date.now();
        let verdict: string;
        let rendered: unknown = null;
        try {
          const raw = await gemini.generateJson({
            model,
            system: systemPrompt(lang),
            user: [userPrompt(sheet)],
          });
          const checked = checkThesis(raw, ids);
          if (checked.ok) {
            verdict = "OK";
            rendered = renderThesis(checked.thesis, displayMap(sheet));
          } else
            verdict = `REFUSED\n    - ${checked.problems.join("\n    - ")}`;
        } catch (e) {
          verdict =
            e instanceof GeminiError ? `${e.kind}: ${e.message}` : String(e);
        }
        console.log(
          `${symbol} ${lang} ${model} ${((Date.now() - t0) / 1000).toFixed(1)}s ${verdict}`,
        );
        if (show && rendered) console.log(JSON.stringify(rendered, null, 2));
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
