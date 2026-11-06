/**
 * AI thesis fixtures (DEV / tests only). Reached ONLY through `./fixtures`, which `./index` loads
 * with a dynamic import in fixtures mode, so none of this reaches a live build.
 *
 * The text mirrors what the server returns: every figure is already rendered (the model only
 * writes `{{metric_id}}` placeholders), formatted like `lib/ai/format.ts`, and consistent with
 * `tests/fixtures/contract/AAPL/stock.json` (a test checks this).
 *
 * How to see each state in the browser (fixtures mode only), add `?aiState=` to a stock page:
 *   ready (default for AAPL) | stale | no_key | quota_exhausted | model_error |
 *   not_applicable_for_type | insufficient_data | markup | loading | down
 * Without the query, SPY -> not_applicable_for_type, RIVN -> insufficient_data, AAPL -> ready,
 * any other fixture ticker -> a short sample thesis with no figures.
 */
import type {
  AiLanguage,
  AiUnavailableReason,
  Thesis,
  ThesisResponse,
} from "@/lib/contract";

export type ThesisVariant =
  "ready" | "stale" | "markup" | AiUnavailableReason | "loading" | "down";

export const THESIS_VARIANTS: readonly ThesisVariant[] = [
  "ready",
  "stale",
  "markup",
  "no_key",
  "quota_exhausted",
  "model_error",
  "not_applicable_for_type",
  "insufficient_data",
  "loading",
  "down",
];

export const isThesisVariant = (v: string | null): v is ThesisVariant =>
  v !== null && (THESIS_VARIANTS as readonly string[]).includes(v);

/** Tickers that are not companies, in the fixture set. */
const FUNDS = new Set(["SPY"]);
/** Tickers whose data is too thin for a grounded thesis, in the fixture set. */
const THIN = new Set(["RIVN"]);

export function defaultVariant(symbol: string): ThesisVariant {
  const s = symbol.toUpperCase();
  if (FUNDS.has(s)) return "not_applicable_for_type";
  if (THIN.has(s)) return "insufficient_data";
  return "ready";
}

const GENERATED_AT = "2026-11-05T20:30:00.000Z";
const STALE_GENERATED_AT = "2026-11-03T08:15:00.000Z";

/* No-break space, as `Intl` writes it in French before % and currency units. */
const NBSP = "\u00a0";

const AAPL_EN: Thesis = {
  whatItDoes:
    "Apple designs and sells devices that people use every day, such as the iPhone, the Mac and the iPad. On top of them it runs services like the App Store, iCloud and Apple Music.",
  howItMakesMoney:
    "Most of the money comes from selling devices, which customers often replace every few years. A growing share comes from services (subscriptions, apps, payments), which usually keep more profit from each sale.",
  bullCase: [
    "The business is very profitable: an operating margin of 31.1% means it keeps roughly a third of each dollar of sales as operating profit.",
    "Sales are still growing, at +11.7% over the latest period, even though Apple is already a very large company.",
    "It generates a lot of cash (free cash flow of $25.86B in the latest quarter) and pays out only 11.8% of its profit as dividends (payout ratio, DPR), so the dividend is easy to cover.",
  ],
  bearCase: [
    "At a trailing P/E of 38.3, investors pay for about 38.3 years of today's profit, so a lot of good news is already expected.",
    "The dividend yield is only 0.3%, which is little for someone who wants regular income.",
    "The average analyst price target ($333.28) is below the current share price, so on average analysts see little room to rise.",
  ],
  holdCase: [
    "The forward P/E of 32.3 is lower than the trailing P/E of 38.3, which hints that profits are expected to grow, but that rests on forecasts that can be wrong.",
    "A great company and a high price can both be true: some investors prefer to wait for a price that leaves a bigger margin of safety.",
    "Analyst opinions are mixed: most say buy, but a sizeable group says hold or sell.",
  ],
  keyRisks: [
    "A large part of sales still depends on the iPhone, so weaker phone sales would be felt across the whole company.",
    "Rules and court cases about the App Store and about competition could reduce the money made from services.",
    "Products are made and sold in several countries, so trade tensions or supply problems can disrupt the business.",
  ],
  whatToWatch: [
    "Whether sales growth stays near +11.7% or slows down.",
    "Whether services keep growing as a share of total sales.",
    "The next earnings report, expected around 28 Jan 2027 (an estimate).",
  ],
  glossaryTerms: [
    "pe",
    "payout_ratio",
    "free_cash_flow",
    "operating_margin",
    "revenue_growth",
    "margin_of_safety",
  ],
};

const AAPL_FR: Thesis = {
  whatItDoes:
    "Apple conçoit et vend des appareils que l'on utilise tous les jours, comme l'iPhone, le Mac et l'iPad. Elle y ajoute des services comme l'App Store, iCloud et Apple Music.",
  howItMakesMoney:
    "L'essentiel de l'argent vient de la vente d'appareils, que les clients remplacent souvent au bout de quelques années. Une part croissante vient des services (abonnements, applications, paiements), qui laissent en général plus de bénéfice sur chaque vente.",
  bullCase: [
    `L'activité est très rentable : une marge d'exploitation de 31,1${NBSP}% signifie qu'elle garde environ un tiers de chaque dollar de ventes en résultat d'exploitation.`,
    `Le chiffre d'affaires continue de croître, de +11,7${NBSP}% sur la dernière période, alors qu'Apple est déjà une très grande entreprise.`,
    `Elle génère beaucoup de trésorerie (flux de trésorerie disponible de 25,86${NBSP}Md${NBSP}$US sur le dernier trimestre) et ne verse que 11,8${NBSP}% de son bénéfice en dividendes (taux de distribution, DPR) : le dividende est facile à couvrir.`,
  ],
  bearCase: [
    `Avec un P/E sur douze mois de 38,3, les investisseurs paient environ 38,3 ans de bénéfice actuel : beaucoup de bonnes nouvelles sont déjà attendues.`,
    `Le rendement du dividende n'est que de 0,3${NBSP}%, ce qui est peu pour qui cherche un revenu régulier.`,
    `L'objectif de cours moyen des analystes (333,28${NBSP}$US) est inférieur au cours actuel : en moyenne, les analystes voient peu de marge de hausse.`,
  ],
  holdCase: [
    `Le P/E prévisionnel de 32,3 est inférieur au P/E sur douze mois de 38,3, ce qui laisse penser que le bénéfice devrait croître, mais cela repose sur des prévisions qui peuvent se tromper.`,
    `Une excellente entreprise et un prix élevé peuvent aller ensemble : certains investisseurs préfèrent attendre un prix qui laisse une plus grande marge de sécurité.`,
    `Les avis des analystes sont partagés : la plupart disent acheter, mais un groupe important dit conserver ou vendre.`,
  ],
  keyRisks: [
    `Une grande partie des ventes dépend encore de l'iPhone : de moindres ventes de téléphones se feraient sentir dans toute l'entreprise.`,
    `Des règles et des procès sur l'App Store et sur la concurrence pourraient réduire l'argent gagné grâce aux services.`,
    `Les produits sont fabriqués et vendus dans plusieurs pays : des tensions commerciales ou des problèmes d'approvisionnement peuvent perturber l'activité.`,
  ],
  whatToWatch: [
    `Si la croissance du chiffre d'affaires reste proche de +11,7${NBSP}% ou ralentit.`,
    `Si les services continuent de peser plus lourd dans les ventes totales.`,
    `La prochaine publication des résultats, attendue vers le 28 janv. 2027 (une estimation).`,
  ],
  glossaryTerms: [
    "pe",
    "payout_ratio",
    "free_cash_flow",
    "operating_margin",
    "revenue_growth",
    "margin_of_safety",
  ],
};

/** A short, figure-free thesis for the other fixture tickers (their page numbers differ from AAPL's). */
function sample(name: string, lang: AiLanguage): Thesis {
  return lang === "fr"
    ? {
        whatItDoes: `${name} est une entreprise cotée en bourse. Ceci est un texte d'exemple pour le développement : avec les données réelles, l'IA décrit ce que fait vraiment l'entreprise.`,
        howItMakesMoney: `Texte d'exemple : l'IA expliquerait ici, en mots simples, d'où vient l'argent de ${name}.`,
        bullCase: [
          `Argument d'exemple : ce que les partisans de ${name} mettent en avant.`,
          `Un second argument d'exemple, relié à un chiffre de la page.`,
        ],
        bearCase: [
          `Argument d'exemple : ce qui inquiète les sceptiques au sujet de ${name}.`,
          `Un second argument d'exemple, relié à un chiffre de la page.`,
        ],
        holdCase: [
          `Argument d'exemple : pourquoi certains préfèrent attendre avant de se faire une opinion sur ${name}.`,
          `Un second argument d'exemple.`,
        ],
        keyRisks: [`Risque d'exemple pour ${name}.`],
        whatToWatch: [`Point d'exemple à surveiller pour ${name}.`],
        glossaryTerms: ["eps", "market_cap"],
      }
    : {
        whatItDoes: `${name} is a listed company. This is sample text for development: with live data the AI describes what the company really does.`,
        howItMakesMoney: `Sample text: here the AI would explain, in plain words, where ${name} gets its money.`,
        bullCase: [
          `Sample argument: what supporters of ${name} point to.`,
          `A second sample argument, tied to a number on the page.`,
        ],
        bearCase: [
          `Sample argument: what worries sceptics about ${name}.`,
          `A second sample argument, tied to a number on the page.`,
        ],
        holdCase: [
          `Sample argument: why some prefer to wait before forming a view on ${name}.`,
          `A second sample argument.`,
        ],
        keyRisks: [`Sample risk for ${name}.`],
        whatToWatch: [`Sample point to watch for ${name}.`],
        glossaryTerms: ["eps", "market_cap"],
      };
}

/**
 * Model output is untrusted text. These strings carry markup on purpose: the UI must show them
 * literally (React text nodes), never interpret them.
 */
function markup(lang: AiLanguage): Thesis {
  const base = lang === "fr" ? AAPL_FR : AAPL_EN;
  return {
    ...base,
    whatItDoes:
      "**Bold stars** and <b>bold tags</b> and <script>alert(1)</script> and [a link](javascript:alert(1)) must all appear exactly as typed.",
    bullCase: [
      "<img src=x onerror=alert(1)> stays text",
      "## not a heading",
      "- not a list item",
    ],
  };
}

function meta(lang: AiLanguage, ready: boolean, stale: boolean) {
  return {
    contractVersion: "0.4.0" as const,
    language: lang,
    model: ready ? "fixture-model" : null,
    generatedAt: ready ? (stale ? STALE_GENERATED_AT : GENERATED_AT) : null,
    stale,
  };
}

const RETRY_AFTER_QUOTA_SECONDS = 3 * 60 * 60;

/** Pure: the response the server would send for this symbol, language and state. */
export function thesisFixture(
  symbol: string,
  lang: AiLanguage,
  variant: ThesisVariant,
  name?: string,
): ThesisResponse {
  const sym = symbol.toUpperCase();
  const unavailable = (
    reason: AiUnavailableReason,
    retryAfter?: number,
  ): ThesisResponse => ({
    meta: meta(lang, false, false),
    symbol: sym,
    result:
      retryAfter === undefined
        ? { status: "unavailable", reason }
        : { status: "unavailable", reason, retryAfter },
  });

  switch (variant) {
    case "no_key":
    case "model_error":
    case "not_applicable_for_type":
    case "insufficient_data":
      return unavailable(variant);
    case "quota_exhausted":
      return unavailable(variant, RETRY_AFTER_QUOTA_SECONDS);
    case "markup":
      return {
        meta: meta(lang, true, false),
        symbol: sym,
        result: { status: "ready", thesis: markup(lang) },
      };
    default: {
      // "ready", "stale", and the two client-only states ("loading", "down") that never get here.
      const stale = variant === "stale";
      const thesis =
        sym === "AAPL"
          ? lang === "fr"
            ? AAPL_FR
            : AAPL_EN
          : sample(name ?? sym, lang);
      return {
        meta: meta(lang, true, stale),
        symbol: sym,
        result: { status: "ready", thesis },
      };
    }
  }
}
