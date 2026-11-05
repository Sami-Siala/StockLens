/**
 * Yahoo soak test (PLAN §3.3): hit a deployed spike endpoint every few minutes for days,
 * log every response, and report the non-200 rate. PASS = under 2 % non-200.
 *
 *   SOAK_URL=https://<your-spike>.vercel.app/api/spike npx tsx scripts/soak.ts
 *   SOAK_URL=http://localhost:3000/api/spike SOAK_INTERVAL_MIN=1 npx tsx scripts/soak.ts   # local trial
 *   npx tsx scripts/soak.ts --report                                                        # verdict from the log
 *
 * The log is an append-only JSONL file (soak-log.jsonl, git-ignored). Run it under
 * `caffeinate -i` or on any always-on machine; it resumes cleanly because the log is append-only.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const LOG = process.env.SOAK_LOG ?? "soak-log.jsonl";
const SYMBOLS = (process.env.SOAK_SYMBOLS ?? "AAPL,MC.PA,7203.T").split(",");
const INTERVAL_MS = Number(process.env.SOAK_INTERVAL_MIN ?? "5") * 60_000;
const PASS_THRESHOLD = 0.02;

interface Row {
  at: string;
  symbol: string;
  status: number;
  ms: number;
  note?: string;
}

function report(): void {
  if (!existsSync(LOG)) return void console.log(`No log at ${LOG}`);
  const rows = readFileSync(LOG, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Row);
  const bad = rows.filter((r) => r.status !== 200);
  const rate = rows.length ? bad.length / rows.length : 0;
  const span = rows.length ? `${rows[0].at} -> ${rows.at(-1)!.at}` : "n/a";
  console.log(
    `requests: ${rows.length}  non-200: ${bad.length}  rate: ${(rate * 100).toFixed(2)} %  window: ${span}`,
  );
  const byStatus = new Map<number, number>();
  for (const r of bad)
    byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
  for (const [s, n] of byStatus) console.log(`  HTTP ${s}: ${n}`);
  const days = rows.length
    ? (Date.parse(rows.at(-1)!.at) - Date.parse(rows[0].at)) / 864e5
    : 0;
  console.log(
    rate < PASS_THRESHOLD && days >= 3
      ? `VERDICT: PASS (< ${PASS_THRESHOLD * 100} % over ${days.toFixed(1)} days)`
      : days < 3
        ? `VERDICT: INCONCLUSIVE (only ${days.toFixed(1)} of 3+ days so far)`
        : `VERDICT: FAIL -> Plan B (PLAN §3.6)`,
  );
}

async function tick(base: string): Promise<void> {
  for (const symbol of SYMBOLS) {
    const t0 = Date.now();
    let row: Row;
    try {
      const res = await fetch(`${base}?symbol=${encodeURIComponent(symbol)}`, {
        signal: AbortSignal.timeout(30_000),
      });
      await res.arrayBuffer();
      row = {
        at: new Date().toISOString(),
        symbol,
        status: res.status,
        ms: Date.now() - t0,
      };
    } catch (e) {
      row = {
        at: new Date().toISOString(),
        symbol,
        status: 0,
        ms: Date.now() - t0,
        note: String(e).slice(0, 120),
      };
    }
    appendFileSync(LOG, JSON.stringify(row) + "\n");
    console.log(`${row.at} ${symbol} -> ${row.status} (${row.ms} ms)`);
    await new Promise((r) => setTimeout(r, 2_000));
  }
}

async function main() {
  if (process.argv.includes("--report")) return report();
  const base = process.env.SOAK_URL;
  if (!base)
    throw new Error(
      "Set SOAK_URL to the deployed spike endpoint (see header).",
    );
  for (;;) {
    await tick(base);
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
