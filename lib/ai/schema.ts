import { z } from "zod";
import type { GlossaryTermId, Thesis } from "@/lib/contract";
import { THESIS_LIMITS } from "./config";

/** Runtime list of the glossary ids the contract allows (Step 5 writes the definitions). */
export const GLOSSARY_TERM_IDS = [
  "eps",
  "pe",
  "forward_pe",
  "market_cap",
  "dividend_yield",
  "payout_ratio",
  "free_cash_flow",
  "operating_margin",
  "revenue_growth",
  "analyst_target",
  "beta",
  "margin_of_safety",
  "circle_of_competence",
] as const satisfies readonly GlossaryTermId[];

// Compile-time proof the list above is complete: this line fails to type-check if the contract gains an id.
type Missing = Exclude<GlossaryTermId, (typeof GLOSSARY_TERM_IDS)[number]>;
const _complete: [Missing] extends [never] ? true : never = true;
void _complete;

const { paragraphMax, pointMax, casePoints, listPoints } = THESIS_LIMITS;

const paragraph = z.string().trim().min(1).max(paragraphMax);
const point = z.string().trim().min(1).max(pointMax);

/** What we accept from the model. Strict: anything else is a refused answer, never a patched one. */
export const ThesisSchema = z
  .object({
    whatItDoes: paragraph,
    howItMakesMoney: paragraph,
    bullCase: z.array(point).min(casePoints.min).max(casePoints.max),
    bearCase: z.array(point).min(casePoints.min).max(casePoints.max),
    holdCase: z.array(point).min(casePoints.min).max(casePoints.max),
    keyRisks: z.array(point).min(listPoints.min).max(listPoints.max),
    whatToWatch: z.array(point).min(listPoints.min).max(listPoints.max),
    glossaryTerms: z.array(z.enum(GLOSSARY_TERM_IDS)).max(6),
  })
  .strict() satisfies z.ZodType<Thesis>;

const stringArray = (min: number, max: number) => ({
  type: "array",
  minItems: min,
  maxItems: max,
  items: { type: "string", maxLength: pointMax },
});

/**
 * The same shape as JSON Schema, sent to Gemini so the answer is constrained at the source.
 * (Our zod schema stays the judge: a model can still return something valid for Gemini and wrong for us.)
 */
export const THESIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "whatItDoes",
    "howItMakesMoney",
    "bullCase",
    "bearCase",
    "holdCase",
    "keyRisks",
    "whatToWatch",
    "glossaryTerms",
  ],
  properties: {
    whatItDoes: { type: "string", maxLength: paragraphMax },
    howItMakesMoney: { type: "string", maxLength: paragraphMax },
    bullCase: stringArray(casePoints.min, casePoints.max),
    bearCase: stringArray(casePoints.min, casePoints.max),
    holdCase: stringArray(casePoints.min, casePoints.max),
    keyRisks: stringArray(listPoints.min, listPoints.max),
    whatToWatch: stringArray(listPoints.min, listPoints.max),
    glossaryTerms: {
      type: "array",
      maxItems: 6,
      items: { type: "string", enum: [...GLOSSARY_TERM_IDS] },
    },
  },
} as const;
