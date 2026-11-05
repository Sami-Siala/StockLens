/**
 * Shared by scripts/smoke.ts and scripts/build-availability-matrix.ts:
 * flatten a StockSnapshot into "which fields came back and why not" and render the matrix.
 */
import type {
  ChartResponse,
  Metric,
  StockSnapshot,
  UnavailableReason,
} from "../lib/contract";

export interface Cell {
  ok: boolean;
  /** "OK" or a short reason code. */
  code: string;
}

const SHORT: Record<UnavailableReason, string> = {
  not_applicable_for_type: "n/a (type)",
  negative_earnings: "neg. earnings",
  not_reported: "not reported",
  reported_less_often: "semi-annual",
  not_provided_by_source: "no source",
  currency_mismatch: "currency",
  provider_error: "ERROR",
};

const OK: Cell = { ok: true, code: "OK" };
const cell = (m: Metric<unknown> | undefined): Cell =>
  !m
    ? { ok: false, code: "missing" }
    : m.reason === null
      ? OK
      : { ok: false, code: SHORT[m.reason] };
const present = (n: number, min = 1): Cell =>
  n >= min ? OK : { ok: false, code: "none" };

export interface FieldGroup {
  group: string;
  fields: Array<[string, Cell]>;
}

export function extractFields(
  s: StockSnapshot,
  charts?: Partial<Record<string, ChartResponse | null>>,
): FieldGroup[] {
  const q = s.quote;
  const f = s.fundamentals.value;
  const secMiss = (m: Metric<unknown>): Cell => cell(m);
  const ks = f?.keyStats;
  const sec = s.fundamentals;
  const k = (m: Metric<unknown> | undefined) => (ks ? cell(m) : secMiss(sec));
  const lastQ = f?.quarterly.at(-1);
  const lastA = f?.annual.at(-1);
  const stmt = (p: typeof lastQ, line: keyof NonNullable<typeof lastQ>) =>
    !f
      ? secMiss(sec)
      : !p
        ? { ok: false, code: "no rows" }
        : cell(p[line] as Metric<number>);
  const e = s.earnings.value;
  const a = s.analysts.value;
  const earn = (fn: (e: NonNullable<typeof s.earnings.value>) => Cell): Cell =>
    e ? fn(e) : secMiss(s.earnings);
  const an = (m: Metric<unknown> | undefined): Cell =>
    a ? cell(m) : secMiss(s.analysts);

  const groups: FieldGroup[] = [
    {
      group: "Quote",
      fields: [
        ["price + change", cell(q)],
        [
          "previous close / day range / volume",
          q.value
            ? q.value.previousClose !== null &&
              q.value.dayHigh !== null &&
              q.value.volume !== null
              ? OK
              : { ok: false, code: "partial" }
            : cell(q),
        ],
        [
          "52-week range",
          q.value
            ? q.value.fiftyTwoWeekHigh !== null
              ? OK
              : { ok: false, code: "no source" }
            : cell(q),
        ],
        [
          "exchange delay (minutes)",
          q.value
            ? q.value.delayMinutes !== null
              ? OK
              : { ok: false, code: "no source" }
            : cell(q),
        ],
      ],
    },
    {
      group: "Company profile",
      fields: [
        ["sector / industry / country", cell(s.profile)],
        [
          "business summary (AI input)",
          s.profile.value
            ? s.profile.value.summary
              ? OK
              : { ok: false, code: "no source" }
            : cell(s.profile),
        ],
      ],
    },
    {
      group: "Key numbers",
      fields: [
        ["market cap", k(ks?.marketCap)],
        ["shares outstanding", k(ks?.sharesOutstanding)],
        ["trailing P/E", k(ks?.trailingPE)],
        ["forward P/E", k(ks?.forwardPE)],
        ["trailing EPS", k(ks?.trailingEps)],
        ["dividend yield", k(ks?.dividendYield)],
        ["dividend rate", k(ks?.dividendRate)],
        ["payout ratio (DPR)", k(ks?.payoutRatio)],
        ["operating margin", k(ks?.operatingMargin)],
        ["revenue growth (yoy)", k(ks?.revenueGrowth)],
        ["beta", k(ks?.beta)],
      ],
    },
    {
      group: "Statements: latest quarter",
      fields: [
        ["revenue", stmt(lastQ, "revenue")],
        ["operating income", stmt(lastQ, "operatingIncome")],
        ["net income", stmt(lastQ, "netIncome")],
        ["free cash flow", stmt(lastQ, "freeCashFlow")],
        ["diluted EPS", stmt(lastQ, "dilutedEps")],
      ],
    },
    {
      group: "Statements: latest fiscal year",
      fields: [
        ["revenue", stmt(lastA, "revenue")],
        ["operating income", stmt(lastA, "operatingIncome")],
        ["net income", stmt(lastA, "netIncome")],
        ["free cash flow", stmt(lastA, "freeCashFlow")],
        [
          "rows available (3 expected)",
          f ? present(f.annual.length, 3) : secMiss(sec),
        ],
      ],
    },
    {
      group: "Earnings",
      fields: [
        [
          "EPS actual vs estimate (last quarter)",
          earn((x) => cell(x.lastQuarter)),
        ],
        ["EPS history (4 quarters)", earn((x) => present(x.history.length, 4))],
        ["next report date", earn((x) => cell(x.next))],
        ["forward EPS estimates", earn((x) => present(x.epsEstimates.length))],
        [
          "forward revenue estimates",
          earn((x) => present(x.revenueEstimates.length)),
        ],
      ],
    },
    {
      group: "Analysts",
      fields: [
        ["buy / hold / sell counts", an(a?.ratings)],
        ["mean rating", an(a?.ratingMean)],
        ["price target (low / mean / high)", an(a?.priceTarget)],
      ],
    },
  ];

  if (charts) {
    groups.push({
      group: "Charts (candles returned)",
      fields: ["1H", "1D", "1W", "1M", "1Y", "3Y", "5Y", "ALL"].map(
        (r): [string, Cell] => {
          const c = charts[r];
          const n = c?.series.value?.candles.length ?? 0;
          return [
            r,
            n > 0 ? OK : { ok: false, code: c === undefined ? "n/a" : "none" },
          ];
        },
      ),
    });
  }
  return groups;
}

export interface MatrixColumn {
  symbol: string;
  label: string;
  fields: FieldGroup[];
}

/** Markdown table: fields x symbols, plus "present in N/total" per row. */
export function renderMatrix(cols: MatrixColumn[]): string {
  const head = [
    "Field",
    ...cols.map((c) => `${c.symbol}<br>${c.label}`),
    `Present`,
  ];
  const lines = [
    `| ${head.join(" | ")} |`,
    `|${head.map((_, i) => (i === 0 ? "---" : "---")).join("|")}|`,
  ];
  const groups = cols[0].fields.map((g) => g.group);
  groups.forEach((group, gi) => {
    lines.push(`| **${group}** |${" |".repeat(cols.length + 1)}`);
    cols[0].fields[gi].fields.forEach(([name], fi) => {
      const cells = cols.map((c) => c.fields[gi].fields[fi][1]);
      const n = cells.filter((x) => x.ok).length;
      lines.push(
        `| ${name} | ${cells.map((x) => (x.ok ? "✅" : x.code)).join(" | ")} | ${n}/${cols.length} |`,
      );
    });
  });
  return lines.join("\n");
}
