/**
 * Raw Yahoo recordings -> contract fixtures, using the REAL provider (lib/providers) end to end:
 *
 *   npm run fixtures:build
 *
 * For every recorded symbol this writes tests/fixtures/contract/<SYMBOL>/stock.json and one
 * chart-<RANGE>.json per range that has a recording, plus the two search fixtures. Output is
 * deterministic (a fixed "now" = when the payloads were recorded), so a re-run only produces a
 * diff when the normaliser changes. The frontend builds against these.
 */
import "./shim-server-only";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChartRange } from "../lib/contract";
import { MemoryStore } from "../lib/providers/cache/memory";
import { DataService } from "../lib/providers/service";
import { YahooProvider } from "../lib/providers/yahoo";
import { FakeYahooClient, RAW_DIR } from "../tests/helpers/fake-yahoo";

const OUT = join(process.cwd(), "tests/fixtures/contract");
/** The recordings were taken around this moment (Thu 5 Nov 2026, ~20:30 UTC). */
export const RECORDED_AT = new Date("2026-11-05T20:30:00Z");
const RANGES: ChartRange[] = ["1H", "1D", "1W", "1M", "1Y", "3Y", "5Y", "ALL"];

const write = (path: string, body: unknown) =>
  writeFile(path, JSON.stringify(body, null, 2) + "\n");

async function main() {
  const t = RECORDED_AT.getTime();
  const service = new DataService({
    provider: new YahooProvider(new FakeYahooClient(), () => RECORDED_AT),
    store: new MemoryStore(() => t),
    now: () => t,
  });

  const symbols = (await readdir(RAW_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => d.name);

  for (const symbol of symbols) {
    const dir = join(OUT, symbol);
    await mkdir(dir, { recursive: true });
    const stock = await service.getStock(symbol);
    stock.meta.source = "fixture";
    await write(join(dir, "stock.json"), stock);
    const built: string[] = [];
    for (const range of RANGES) {
      try {
        const chart = await service.getChart(symbol, range);
        chart.meta.source = "fixture";
        await write(join(dir, `chart-${range}.json`), chart);
        built.push(range);
      } catch {
        /* no recording for this interval (e.g. SPY only has 1W and 1Y) */
      }
    }
    console.log("built", symbol, "stock +", built.join(" "));
  }

  const dir = join(OUT, "_search");
  await mkdir(dir, { recursive: true });
  for (const name of ["lvmh", "apple"]) {
    const res = await service.search(name);
    res.meta.source = "fixture";
    await write(join(dir, `${name}.json`), res);
  }
  console.log("built search fixtures");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
