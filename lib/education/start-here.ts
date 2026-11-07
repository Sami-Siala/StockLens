/**
 * "Start here" companies for the home page (PLAN §10 Q3): the three original picks (a daily-life
 * brand, French luxury, a Tokyo carmaker) plus the US tech giants worth over about $1 trillion.
 * The first SHOWN_FIRST entries are visible at once, the rest sit behind "show more".
 *
 * Each company carries one line on WHY it is worth a look, in French and in English. The lines
 * are prompts to explore (questions to answer with the numbers), never advice to buy.
 * The nine "why" lines for the tech giants were written 2026-11-07 and are NOT yet reviewed by the professor.
 */
export interface StartHereCompany {
  symbol: string;
  name: string;
  exchange: string;
  why: { en: string; fr: string };
}

export const SHOWN_FIRST = 6;

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
    symbol: "MSFT",
    name: "Microsoft",
    exchange: "NASDAQ",
    why: {
      en: "Windows, Office and cloud services: how much of its revenue turns into profit?",
      fr: "Windows, Office et services cloud : quelle part de son chiffre d'affaires devient du bénéfice ?",
    },
  },
  {
    symbol: "NVDA",
    name: "Nvidia",
    exchange: "NASDAQ",
    why: {
      en: "The chips behind AI: its price already expects a lot, so what does its P/E tell you?",
      fr: "Les puces derrière l'IA : son prix attend déjà beaucoup, que vous dit son PER ?",
    },
  },
  {
    symbol: "GOOG",
    name: "Alphabet (Google)",
    exchange: "NASDAQ",
    why: {
      en: "Search and YouTube: where does the money really come from, and how big is it?",
      fr: "La recherche et YouTube : d'où vient vraiment l'argent, et de quel montant parle-t-on ?",
    },
  },
  {
    symbol: "AMZN",
    name: "Amazon",
    exchange: "NASDAQ",
    why: {
      en: "Shopping and cloud computing: why is its profit small next to its revenue?",
      fr: "Achats en ligne et cloud : pourquoi son bénéfice est-il faible face à son chiffre d'affaires ?",
    },
  },
  {
    symbol: "META",
    name: "Meta",
    exchange: "NASDAQ",
    why: {
      en: "Facebook, Instagram and WhatsApp are free to use: how does it still make money?",
      fr: "Facebook, Instagram et WhatsApp sont gratuits : comment gagne-t-elle quand même de l'argent ?",
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
  {
    symbol: "TSLA",
    name: "Tesla",
    exchange: "NASDAQ",
    why: {
      en: "A carmaker priced like a tech company: what is the market paying for?",
      fr: "Un constructeur valorisé comme une entreprise technologique : que paie le marché ?",
    },
  },
  {
    symbol: "AVGO",
    name: "Broadcom",
    exchange: "NASDAQ",
    why: {
      en: "Chips and software you never see: would you notice if it disappeared?",
      fr: "Des puces et des logiciels que l'on ne voit jamais : remarqueriez-vous s'ils disparaissaient ?",
    },
  },
];
