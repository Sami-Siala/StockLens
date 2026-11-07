/**
 * Pre-warm the AI cache before class: one generation per (ticker, language), so students only ever hit the cache.
 * Spends provider quota (only for what is not cached yet), so run it once, not in a loop.
 *
 *   npx tsx scripts/prewarm-ai.ts --base https://stocks-lens.vercel.app
 *   npx tsx scripts/prewarm-ai.ts --base http://localhost:3000 AAPL MC.PA --lang fr
 *   options: --delay 25 (seconds between generations: Groq allows ~8000 tokens/minute) --lang fr|en (default both)
 *
 * Stops at the first "quota_exhausted" (the rest would fail the same way). Exit code 1 if anything failed.
 */
import { START_HERE } from "../lib/education/start-here";

const DEFAULT_SYMBOLS = START_HERE.map((c) => c.symbol);

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const base = (flag("base") ?? "http://localhost:3000").replace(/\/$/, "");
const delayMs = Number(flag("delay") ?? 25) * 1000;
const langs = flag("lang") ? [flag("lang")!] : ["fr", "en"];
const symbols = args.filter(
  (a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"),
);

async function main() {
  const list = symbols.length ? symbols : DEFAULT_SYMBOLS;
  let failed = 0;
  let first = true;
  for (const symbol of list) {
    for (const lang of langs) {
      if (!first) await new Promise((r) => setTimeout(r, delayMs));
      first = false;
      const t0 = Date.now();
      let line: string;
      let stop = false;
      try {
        const res = await fetch(
          `${base}/api/ai/${encodeURIComponent(symbol)}?lang=${lang}`,
          { headers: { Origin: base }, signal: AbortSignal.timeout(90_000) },
        );
        const body = (await res.json()) as {
          meta?: { model: string | null; stale: boolean };
          result?: { status: string; reason?: string };
          error?: { code: string };
        };
        if (body.result?.status === "ready") {
          line = `ok (${body.meta?.model}${body.meta?.stale ? ", stale" : ""})`;
        } else if (body.result?.reason === "not_applicable_for_type") {
          line = "skipped (not a company)";
        } else {
          failed++;
          line = `FAILED ${body.result?.reason ?? body.error?.code ?? res.status}`;
          stop = body.result?.reason === "quota_exhausted";
        }
      } catch (e) {
        failed++;
        line = `FAILED ${e instanceof Error ? e.name : "error"}`;
      }
      console.log(
        `${symbol} ${lang} ${((Date.now() - t0) / 1000).toFixed(1)}s ${line}`,
      );
      if (stop) {
        console.log("Quota exhausted: stopping.");
        process.exit(1);
      }
    }
  }
  process.exit(failed ? 1 : 0);
}

main();
