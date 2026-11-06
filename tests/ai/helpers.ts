import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { StockSnapshot } from "@/lib/contract";
import type { GeminiHttpResponse, GeminiTransport } from "@/lib/ai/gemini";

export const loadStock = (symbol: string): StockSnapshot =>
  JSON.parse(
    readFileSync(
      join(__dirname, "../fixtures/contract", symbol, "stock.json"),
      "utf8",
    ),
  ) as StockSnapshot;

/** A thesis as the model should write it: placeholders, no typed figures. All ids exist for AAPL. */
export const GOOD_REPLY = {
  whatItDoes: "It designs phones and computers and sells services around them.",
  howItMakesMoney:
    "Most of its money comes from selling devices, plus subscriptions and the App Store.",
  bullCase: [
    "A P/E of {{pe_trailing}} shows investors expect strong growth.",
    "A market capitalisation of {{market_cap}} signals a very large business.",
  ],
  bearCase: [
    "At a P/E of {{pe_trailing}} the share is not cheap, so disappointments hurt.",
    "A dividend yield of only {{dividend_yield}} gives little cushion.",
  ],
  holdCase: [
    "Analysts' average target of {{target_mean}} is not far from the price.",
    "{{analysts_buy}} analysts say buy, but the picture is mixed.",
  ],
  keyRisks: [
    "Sales depend heavily on one product family.",
    "Rules about app stores could reduce services income.",
  ],
  whatToWatch: [
    "The next earnings report on {{next_earnings_date}}.",
    "Whether revenue growth of {{revenue_growth}} holds up.",
  ],
  glossaryTerms: ["pe", "market_cap", "dividend_yield"],
};

export const okBody = (reply: unknown): GeminiHttpResponse => ({
  status: 200,
  body: {
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify(reply) }] },
      },
    ],
  },
});

export const status = (
  code: number,
  body: unknown = {},
): GeminiHttpResponse => ({
  status: code,
  body,
});

export interface Call {
  model: string;
  body: {
    contents: Array<{ parts: Array<{ text: string }> }>;
    systemInstruction: { parts: Array<{ text: string }> };
  };
}

/** A scripted Gemini: `answer(call, n)` returns the response for the n-th call (0-based). */
export function fakeGemini(
  answer: (
    call: Call,
    n: number,
  ) => GeminiHttpResponse | Promise<GeminiHttpResponse>,
) {
  const calls: Call[] = [];
  const transport: GeminiTransport = async ({ model, body }) => {
    const call = { model, body } as Call;
    calls.push(call);
    return answer(call, calls.length - 1);
  };
  return { transport, calls };
}
