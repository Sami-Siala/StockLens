import "server-only";
import type { PriceSubunit } from "@/lib/contract";

/**
 * Sub-unit currency table. Yahoo quotes some exchanges in the minor unit:
 *   GBp / GBX  pence    -> GBP (London)
 *   ZAc / ZAC  cents    -> ZAR (Johannesburg)
 *   ILA        agorot   -> ILS (Tel Aviv)
 * Everything else is passed through untouched (we never guess a unit).
 */
const SUBUNITS: Record<string, { major: string; factor: number }> = {
  GBp: { major: "GBP", factor: 100 },
  GBX: { major: "GBP", factor: 100 },
  ZAc: { major: "ZAR", factor: 100 },
  ZAC: { major: "ZAR", factor: 100 },
  ILA: { major: "ILS", factor: 100 },
};

export interface ResolvedCurrency {
  /** Major currency code to expose in the contract. */
  currency: string;
  /** Multiply a value QUOTED in `quotedAs` by this to get the major unit (1 when no sub-unit). */
  scale: number;
  subunit: PriceSubunit | null;
}

export function resolveCurrency(code: string): ResolvedCurrency {
  const sub = SUBUNITS[code];
  if (!sub) return { currency: code, scale: 1, subunit: null };
  return {
    currency: sub.major,
    scale: 1 / sub.factor,
    subunit: { quotedAs: code, factor: sub.factor },
  };
}

/** Round away float noise from dividing by 100 (123456 / 100 -> 1234.56, not 1234.5600000000002). */
export function scaleValue(value: number, scale: number): number {
  if (scale === 1) return value;
  return Number((value * scale).toPrecision(12));
}
