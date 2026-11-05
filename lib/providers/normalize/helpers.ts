import "server-only";
import type {
  InstrumentType,
  MarketState,
  Metric,
  UnavailableReason,
} from "@/lib/contract";

export const ok = <T>(value: T): Metric<T> => ({ value, reason: null });
export const miss = <T>(reason: UnavailableReason): Metric<T> => ({
  value: null,
  reason,
});

/** Present finite number -> ok, else the given reason. Never emits NaN or a fabricated 0. */
export function metric(
  x: number | undefined | null,
  reason: UnavailableReason,
): Metric<number> {
  return typeof x === "number" && Number.isFinite(x) ? ok(x) : miss(reason);
}

export const nn = (x: number | undefined | null): number | null =>
  typeof x === "number" && Number.isFinite(x) ? x : null;

const TYPES: InstrumentType[] = [
  "EQUITY",
  "ETF",
  "MUTUALFUND",
  "INDEX",
  "CRYPTOCURRENCY",
  "CURRENCY",
  "FUTURE",
];
export function instrumentType(t: string | undefined | null): InstrumentType {
  return TYPES.includes(t as InstrumentType) ? (t as InstrumentType) : "OTHER";
}

export function marketState(s: string | undefined | null): MarketState {
  switch (s) {
    case "REGULAR":
    case "PRE":
    case "POST":
      return s;
    case "CLOSED":
    case "PREPRE":
    case "POSTPOST":
      return "CLOSED";
    default:
      return "UNKNOWN";
  }
}

/** YYYY-MM-DD part of an ISO timestamp. */
export const day = (iso: string): string => iso.slice(0, 10);

/** Round to `digits` decimals (kills binary-float noise such as 0.0672499999999998). */
export const round = (x: number, digits = 6): number =>
  Number(x.toFixed(digits));

/** Percent units -> fraction without float noise (3.12 -> 0.0312, not 0.031200000000000002). */
export const pct = (percent: number): number =>
  Number((percent / 100).toPrecision(12));
