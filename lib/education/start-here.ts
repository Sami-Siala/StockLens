/**
 * Placeholder "start here" companies for the home page. The REAL curated list comes from the
 * professor later (PLAN §10 Q3): replace the entries below, keep the shape.
 *
 * Each company carries one line on WHY it is worth a look, in French and in English. The lines
 * are prompts to explore (questions to answer with the numbers), never advice to buy.
 * FR AND EN COPY HERE IS A PLACEHOLDER AND NEEDS THE PROFESSOR'S REVIEW.
 */
export interface StartHereCompany {
  symbol: string;
  name: string;
  exchange: string;
  why: { en: string; fr: string };
}

export const START_HERE: readonly StartHereCompany[] = [
  {
    symbol: "AAPL",
    name: "Apple",
    exchange: "NASDAQ",
    why: {
      en: "A brand you know from daily life: what does its profit per share look like?",
      fr: "Une marque de votre quotidien : à quoi ressemble son bénéfice par action ?",
    },
  },
  {
    symbol: "MC.PA",
    name: "LVMH",
    exchange: "Paris",
    why: {
      en: "French luxury on the Paris exchange: can you see its pricing power in the numbers?",
      fr: "Le luxe français coté à Paris : voit-on son pouvoir de fixer ses prix dans les chiffres ?",
    },
  },
  {
    symbol: "7203.T",
    name: "Toyota",
    exchange: "Tokyo",
    why: {
      en: "A carmaker listed in Tokyo: a price in yen, on another exchange, with its own report dates.",
      fr: "Un constructeur automobile coté à Tokyo : un prix en yens, sur une autre place boursière, avec ses propres dates de résultats.",
    },
  },
];
