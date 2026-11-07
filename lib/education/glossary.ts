import type { GlossaryTermId } from "@/lib/contract";
import { matchesQuery } from "./search";

/**
 * The StockLens glossary (PLAN §5, Step 5a). The copy lives with the data, not in `messages/`.
 *
 * Vocabulary and voice follow the club lectures (Aziz's café, BPA/EPS, capitalisation boursière,
 * DPR...). Everything is plain text, framed as "how to read this number", never as advice.
 *
 * FRENCH AND ENGLISH WORDING HERE IS FOR THE PROFESSOR TO REVIEW (PLAN §5, Step 5 exit criterion).
 * Search the file for `seance: null` to see the terms that go beyond the lectures.
 */

/** The 13 ids a thesis may reference (lib/contract/ai.ts) plus the terms the other cards use. */
export type GlossaryId =
  | GlossaryTermId
  // The "Revenue" key card.
  | "revenue"
  // Lecture concepts (PLAN §5 table) that the thesis does not cite yet.
  | "dcf"
  | "intrinsic_value"
  | "ticker"
  | "hindsight_bias"
  | "opportunity_cost";

export type GlossaryLocale = "fr" | "en";

/**
 * The club's session number where the term is taught (last year's series, Séance 1 to 4).
 * `null` = a useful term that the lectures do not cover; the UI then shows no tag.
 */
export type Seance = 1 | 2 | 3 | 4;

export interface GlossaryText {
  /** Display name, with the usual abbreviation ("Bénéfice par action (BPA)"). */
  name: string;
  /** One line, shown on the home tile and as the subtitle on the glossary page. */
  short: string;
  definition: string;
  /** Only for terms that really are a calculation. */
  formula?: string;
  /** A concrete, invented example (the café, the bakery). */
  example: string;
  /** A common reading guide. Always displayed under a "rule of thumb" label, never as a law. */
  ruleOfThumb?: string;
}

export interface GlossaryEntry {
  id: GlossaryId;
  seance: Seance | null;
  /** Other terms worth reading next ("See also"). */
  related: GlossaryId[];
  fr: GlossaryText;
  en: GlossaryText;
}

export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    id: "eps",
    seance: 2,
    related: ["pe", "payout_ratio"],
    fr: {
      name: "Bénéfice par action (BPA)",
      short: "Le bénéfice de l'entreprise, réparti sur chaque action.",
      definition:
        "Le bénéfice moyen par action : le bénéfice total de l'entreprise divisé par le nombre d'actions en circulation. En anglais : EPS (Earnings Per Share).",
      formula: "BPA = bénéfice total ÷ nombre d'actions en circulation",
      example:
        "Le café d'Aziz gagne 10 000 DT par an et compte 100 actions : le BPA est de 10 000 ÷ 100 = 100 DT.",
      ruleOfThumb:
        "Un BPA seul ne dit pas si une action est chère. On le compare au cours (c'est le P/E) et on regarde son évolution sur plusieurs années.",
    },
    en: {
      name: "Earnings per share (EPS)",
      short: "The company's profit, shared out over each share.",
      definition:
        "The average profit per share: the company's total profit divided by the number of shares in circulation. In French: BPA (bénéfice par action).",
      formula: "EPS = total profit ÷ number of shares in circulation",
      example:
        "Aziz's café makes 10,000 DT a year and has 100 shares: the EPS is 10,000 ÷ 100 = 100 DT.",
      ruleOfThumb:
        "EPS on its own does not tell you whether a share is expensive. Compare it with the price (that is the P/E) and look at how it changes over several years.",
    },
  },
  {
    id: "pe",
    seance: 2,
    related: ["eps", "forward_pe", "market_cap"],
    fr: {
      name: "Ratio cours/bénéfice (P/E)",
      short: "Combien d'années de bénéfices pour récupérer son argent.",
      definition:
        "Le cours de l'action divisé par le BPA : ce que le marché paie pour chaque euro de bénéfice. Autrement dit, le nombre d'années de bénéfices actuels qu'il faudrait pour récupérer sa mise. En anglais : P/E (Price to Earnings).",
      formula: "P/E = cours de l'action ÷ BPA",
      example:
        "Aziz demande 50 000 DT pour son café, qui rapporte 10 000 DT par an : il faut 5 ans de bénéfices pour récupérer son argent, le P/E est de 5. S'il en demande 200 000 DT, le P/E est de 20 (20 ans).",
      ruleOfThumb:
        "Un P/E élevé veut souvent dire que le marché parie sur une forte croissance à venir ; un P/E bas, sur une activité stable ou sur des doutes. Il se compare entre entreprises du même secteur, pas dans l'absolu.",
    },
    en: {
      name: "Price-to-earnings ratio (P/E)",
      short: "How many years of profit it takes to earn your money back.",
      definition:
        "The share price divided by the EPS: what the market pays for each euro of profit. Put another way, the number of years of current profit it would take to earn your money back. In French: ratio cours/bénéfice.",
      formula: "P/E = share price ÷ EPS",
      example:
        "Aziz asks 50,000 DT for his café, which makes 10,000 DT a year: it takes 5 years of profit to earn your money back, so the P/E is 5. If he asks 200,000 DT, the P/E is 20 (20 years).",
      ruleOfThumb:
        "A high P/E often means the market is betting on strong future growth; a low P/E, on a steady business or on doubts. Compare it between companies in the same sector, not in absolute terms.",
    },
  },
  {
    id: "forward_pe",
    seance: null,
    related: ["pe", "eps"],
    fr: {
      name: "P/E prévisionnel",
      short: "Le P/E calculé avec le bénéfice que les analystes attendent.",
      definition:
        "Comme le P/E, mais au lieu du bénéfice déjà réalisé, on utilise le bénéfice que les analystes attendent pour les 12 prochains mois. On distingue le P/E passé (trailing) du P/E prévisionnel (forward).",
      formula: "P/E prévisionnel = cours de l'action ÷ BPA attendu",
      example:
        "Le café d'Aziz a gagné 10 000 DT cette année et les analystes en attendent 20 000 l'an prochain. Pour un prix de 50 000 DT, le P/E passé est de 5 et le P/E prévisionnel de 2,5.",
      ruleOfThumb:
        "Un P/E prévisionnel nettement plus bas que le P/E actuel signifie que les analystes attendent des bénéfices en hausse. Ce sont des prévisions : elles peuvent se tromper.",
    },
    en: {
      name: "Forward P/E",
      short: "The P/E worked out with the profit analysts expect.",
      definition:
        "Like the P/E, but instead of the profit already earned it uses the profit analysts expect over the next 12 months. The P/E on past profit is called trailing; the one on expected profit is called forward.",
      formula: "Forward P/E = share price ÷ expected EPS",
      example:
        "Aziz's café earned 10,000 DT this year and analysts expect 20,000 next year. For a price of 50,000 DT, the trailing P/E is 5 and the forward P/E is 2.5.",
      ruleOfThumb:
        "A forward P/E well below the current P/E means analysts expect profit to rise. These are forecasts: they can be wrong.",
    },
  },
  {
    id: "market_cap",
    seance: 3,
    related: ["pe", "revenue"],
    fr: {
      name: "Capitalisation boursière",
      short: "Le prix de toute l'entreprise, d'après la bourse.",
      definition:
        "Le cours d'une action multiplié par le nombre d'actions en circulation : ce que la bourse estime que l'entreprise entière vaut aujourd'hui. Le prix d'une seule action ne dit rien de la taille de l'entreprise.",
      formula: "Capitalisation = cours de l'action × nombre d'actions",
      example:
        "Une action à 700 $ n'est pas forcément « plus grosse » qu'une action à 400 $. Avec 10 millions d'actions, la première donne 7 milliards $ ; avec 100 millions d'actions, la seconde donne 40 milliards $.",
      ruleOfThumb:
        "Au-dessus d'environ 10 milliards, on parle souvent de grande capitalisation (large cap). Les petites entreprises voient en général leur cours bouger davantage.",
    },
    en: {
      name: "Market capitalisation (market cap)",
      short: "The price of the whole company, according to the stock market.",
      definition:
        "The share price multiplied by the number of shares in circulation: what the stock market says the whole company is worth today. The price of a single share says nothing about the size of the company.",
      formula: "Market cap = share price × number of shares",
      example:
        'A share at 700 $ is not necessarily "bigger" than a share at 400 $. With 10 million shares, the first adds up to 7 billion $; with 100 million shares, the second adds up to 40 billion $.',
      ruleOfThumb:
        "Above roughly 10 billion, people often speak of a large cap. Smaller companies usually see their share price move more.",
    },
  },
  {
    id: "dividend_yield",
    seance: null,
    related: ["payout_ratio", "eps"],
    fr: {
      name: "Rendement du dividende",
      short: "Le dividende annuel rapporté au prix de l'action.",
      definition:
        "Le dividende que l'entreprise verse en un an pour une action, exprimé en pourcentage du cours. C'est la part du profit que l'actionnaire reçoit en argent, sans rien revendre.",
      formula: "Rendement = dividende annuel par action ÷ cours de l'action",
      example:
        "Une action cote 100 € et verse 3 € de dividende par an : le rendement du dividende est de 3 %.",
      ruleOfThumb:
        "Un rendement très élevé peut venir d'un cours qui a fortement baissé. Il faut alors comprendre pourquoi, et le lire avec le taux de distribution.",
    },
    en: {
      name: "Dividend yield",
      short: "The yearly dividend compared with the share price.",
      definition:
        "The dividend the company pays out over a year for one share, as a percentage of the share price. It is the part of the profit a shareholder receives as cash, without giving up the share.",
      formula: "Yield = yearly dividend per share ÷ share price",
      example:
        "A share is priced at 100 € and pays 3 € in dividends a year: the dividend yield is 3%.",
      ruleOfThumb:
        "A very high yield can come from a share price that has fallen a lot. Then the question is why, and the yield is best read together with the payout ratio.",
    },
  },
  {
    id: "payout_ratio",
    seance: 3,
    related: ["dividend_yield", "eps"],
    fr: {
      name: "Taux de distribution (DPR)",
      short: "La part des bénéfices versée en dividendes.",
      definition:
        "Le ratio dividendes / bénéfices : la part du profit que l'entreprise redistribue à ses actionnaires. Le reste est réinvesti dans l'activité : on échange un gain immédiat contre un gain futur. En anglais : DPR (Dividend Payout Ratio).",
      formula: "DPR = dividende par action ÷ BPA",
      example:
        "Le café d'Aziz gagne 10 000 DT et en distribue 3 000 en dividendes : son DPR est de 30 %.",
      ruleOfThumb:
        "Les entreprises distribuent souvent 30 à 50 % de leurs bénéfices, un peu plus ou un peu moins selon le secteur. Une entreprise en forte croissance réinvestit souvent presque tout.",
    },
    en: {
      name: "Dividend payout ratio (DPR)",
      short: "The share of profit paid out as dividends.",
      definition:
        "The dividends / profit ratio: the part of the profit the company hands back to its shareholders. The rest is reinvested in the business: an immediate gain traded for a future one. In French: taux de distribution.",
      formula: "DPR = dividend per share ÷ EPS",
      example:
        "Aziz's café earns 10,000 DT and pays out 3,000 DT in dividends: its DPR is 30%.",
      ruleOfThumb:
        "Companies often pay out 30 to 50% of their profit, a bit more or less depending on the sector. A fast-growing company often reinvests almost everything.",
    },
  },
  {
    id: "free_cash_flow",
    seance: 2,
    related: ["dcf", "eps", "operating_margin"],
    fr: {
      name: "Flux de trésorerie disponible (FCF)",
      short: "L'argent réellement disponible après les dépenses.",
      definition:
        "Le cash flow (flux de trésorerie), c'est l'argent qui rentre moins l'argent qui sort. Le flux de trésorerie disponible est ce qu'il reste une fois payés le fonctionnement et les investissements nécessaires (machines, bâtiments). C'est la matière première du DCF. En anglais : FCF (Free Cash Flow).",
      formula: "FCF = trésorerie d'exploitation − investissements",
      example:
        "Une boulangerie encaisse 65 000 $ dans l'année et en dépense 50 000 $ : son flux net est de 65 000 − 50 000 = 15 000 $.",
      ruleOfThumb:
        "Un bénéfice positif avec un FCF faible ou négatif n'est pas forcément mauvais (l'entreprise investit peut-être beaucoup), mais il faut en comprendre la raison. Regardez les deux.",
    },
    en: {
      name: "Free cash flow (FCF)",
      short: "The cash really left after the spending.",
      definition:
        "Cash flow is the money coming in minus the money going out. Free cash flow is what is left once running costs and necessary investments (machines, buildings) are paid. It is the raw material of the DCF. In French: flux de trésorerie disponible.",
      formula: "FCF = operating cash flow − investments",
      example:
        "A bakery takes in $65,000 over the year and spends $50,000: its net flow is 65,000 − 50,000 = $15,000.",
      ruleOfThumb:
        "A positive profit with a low or negative FCF is not necessarily bad (the company may be investing a lot), but it is worth understanding why. Look at both.",
    },
  },
  {
    id: "operating_margin",
    seance: null,
    related: ["revenue", "free_cash_flow"],
    fr: {
      name: "Marge d'exploitation",
      short: "La part des ventes qui reste après les coûts de fonctionnement.",
      definition:
        "Le résultat d'exploitation (ce que gagne l'activité courante, avant intérêts et impôts) divisé par le chiffre d'affaires.",
      formula:
        "Marge d'exploitation = résultat d'exploitation ÷ chiffre d'affaires",
      example:
        "Une boulangerie vend pour 100 000 $ de pain par an et dépense 85 000 $ (farine, salaires, loyer) : son résultat d'exploitation est de 15 000 $, soit une marge de 15 %.",
      ruleOfThumb:
        "Les marges varient beaucoup d'un secteur à l'autre. Comparez une entreprise à ses concurrentes et à son propre passé plutôt qu'à un chiffre fixe.",
    },
    en: {
      name: "Operating margin",
      short: "The part of sales left after the running costs.",
      definition:
        "Operating income (what the day-to-day business earns, before interest and taxes) divided by revenue.",
      formula: "Operating margin = operating income ÷ revenue",
      example:
        "A bakery sells $100,000 of bread a year and spends $85,000 (flour, wages, rent): its operating income is $15,000, a 15% margin.",
      ruleOfThumb:
        "Margins differ a lot from one sector to another. Compare a company with its competitors and with its own past rather than with a fixed figure.",
    },
  },
  {
    id: "revenue",
    seance: 3,
    related: ["revenue_growth", "operating_margin", "eps"],
    fr: {
      name: "Chiffre d'affaires (CA)",
      short: "Tout l'argent encaissé grâce aux ventes, avant les coûts.",
      definition:
        "Tout ce que les clients ont payé à l'entreprise sur la période, avant de retirer le moindre coût. On dit aussi les ventes. Bénéfice et chiffre d'affaires sont deux choses différentes.",
      formula: "Chiffre d'affaires = prix de chaque vente × nombre de ventes",
      example:
        "Une entreprise peut afficher 1 milliard de chiffre d'affaires, mais avoir 3 milliards de dépenses et 20 milliards de dette : le chiffre d'affaires seul ne dit pas ce qu'elle vaut.",
      ruleOfThumb:
        "Un chiffre d'affaires en hausse n'est une bonne nouvelle que si le bénéfice suit. Comparez avec la même période l'an dernier.",
    },
    en: {
      name: "Revenue (sales)",
      short: "All the money taken in from sales, before costs.",
      definition:
        "Everything customers paid the company over the period, before taking off any cost. Also called sales. Profit and revenue are two different things.",
      formula: "Revenue = price of each sale × number of sales",
      example:
        "A company can report 1 billion in revenue and still have 3 billion of spending and 20 billion of debt: revenue alone does not tell you what the company is worth.",
      ruleOfThumb:
        "Rising revenue is only good news if profit follows. Compare with the same period last year.",
    },
  },
  {
    id: "revenue_growth",
    seance: null,
    related: ["revenue", "pe"],
    fr: {
      name: "Croissance du chiffre d'affaires",
      short: "De combien les ventes ont augmenté sur un an.",
      definition:
        "L'évolution du chiffre d'affaires par rapport à la même période de l'année précédente, en pourcentage.",
      formula:
        "Croissance = (CA actuel − CA de l'an dernier) ÷ CA de l'an dernier",
      example:
        "Le café d'Aziz a encaissé 100 000 DT l'an dernier et 120 000 DT cette année : la croissance du chiffre d'affaires est de 20 %.",
      ruleOfThumb:
        "Une forte croissance peut expliquer un P/E élevé, mais si elle ralentit alors que le marché en attendait davantage, le cours peut chuter.",
    },
    en: {
      name: "Revenue growth",
      short: "How much sales grew over a year.",
      definition:
        "The change in revenue compared with the same period a year earlier, as a percentage.",
      formula:
        "Growth = (revenue now − revenue a year ago) ÷ revenue a year ago",
      example:
        "Aziz's café took in 100,000 DT last year and 120,000 DT this year: revenue growth is 20%.",
      ruleOfThumb:
        "Strong growth can explain a high P/E, but if it slows down when the market expected more, the share price can fall.",
    },
  },
  {
    id: "analyst_target",
    seance: null,
    related: ["intrinsic_value", "forward_pe"],
    fr: {
      name: "Objectif de cours des analystes",
      short: "Le cours que des professionnels voient dans environ 12 mois.",
      definition:
        "L'estimation, par des analystes de banques et de sociétés de recherche, du cours que l'action pourrait atteindre dans environ 12 mois. Elle se compare au cours actuel et se lit comme une opinion, jamais comme une promesse.",
      example:
        "Le cours est de 90 $ et l'objectif moyen de 108 $ : en moyenne, les analystes voient 20 % de hausse possible. Leur avis peut se révéler faux.",
      ruleOfThumb:
        "Regardez l'écart entre l'objectif le plus bas et le plus haut : plus il est large, plus les analystes sont en désaccord. Ces estimations sont révisées souvent.",
    },
    en: {
      name: "Analyst price target",
      short: "The price professionals see in about 12 months.",
      definition:
        "The estimate, by analysts at banks and research firms, of the price the share could reach in about 12 months. It is compared with the current price and read as an opinion, never as a promise.",
      example:
        "The price is $90 and the average target is $108: on average, analysts see 20% of possible upside. Their view can turn out to be wrong.",
      ruleOfThumb:
        "Look at the gap between the lowest and the highest target: the wider it is, the more the analysts disagree. These estimates get revised often.",
    },
  },
  {
    id: "beta",
    seance: null,
    related: ["market_cap"],
    fr: {
      name: "Bêta",
      short: "Si l'action bouge plus ou moins fort que le marché.",
      definition:
        "Une mesure de la sensibilité d'une action aux mouvements du marché dans son ensemble. Un bêta de 1 signifie que l'action a bougé, par le passé, comme le marché ; au-dessus de 1, plus fort ; en dessous de 1, plus faiblement.",
      example:
        "Le marché baisse de 10 %. Une action de bêta 1,5 réagit souvent plus fort, ici d'environ 15 % ; une action de bêta 0,5, d'environ 5 %.",
      ruleOfThumb:
        "Le bêta est calculé sur le passé : il ne prédit pas l'avenir. Un bêta élevé veut dire des variations plus fortes, à la hausse comme à la baisse.",
    },
    en: {
      name: "Beta",
      short: "Whether the share moves more or less than the market.",
      definition:
        "A measure of how sensitive a share is to the moves of the market as a whole. A beta of 1 means the share has moved like the market in the past; above 1, more strongly; below 1, more gently.",
      example:
        "The market drops 10%. A share with a beta of 1.5 often reacts more strongly, here by about 15%; a share with a beta of 0.5, by about 5%.",
      ruleOfThumb:
        "Beta is worked out from the past: it does not predict the future. A high beta means bigger swings, up as well as down.",
    },
  },
  {
    id: "margin_of_safety",
    seance: 4,
    related: ["intrinsic_value", "circle_of_competence", "dcf"],
    fr: {
      name: "Marge de sécurité",
      short: "L'écart entre la valeur estimée et le prix payé.",
      definition:
        "L'écart entre la valeur que vous estimez à une entreprise et le prix qu'on vous en demande. Comme une estimation reste une estimation, cet écart est une assurance contre vos propres erreurs de calcul. Idée popularisée par Benjamin Graham.",
      formula: "Marge de sécurité = (valeur estimée − prix) ÷ valeur estimée",
      example:
        "Vous estimez qu'une entreprise vaut 100 DT par action. À 95 DT, l'écart est mince (5 %) ; à 60 DT, il est de 40 % : vous avez de la place pour vous tromper.",
      ruleOfThumb:
        "Plus votre estimation est incertaine, plus la marge dont vous avez besoin est grande. L'estimation reste la vôtre : ce glossaire ne dit pas ce qu'il faut en faire.",
    },
    en: {
      name: "Margin of safety",
      short: "The gap between the estimated value and the price paid.",
      definition:
        "The gap between the value you estimate for a company and the price being asked for it. Since an estimate is only an estimate, this gap is insurance against your own calculation errors. An idea popularised by Benjamin Graham.",
      formula: "Margin of safety = (estimated value − price) ÷ estimated value",
      example:
        "You estimate that a company is worth 100 DT a share. At 95 DT the gap is thin (5%); at 60 DT it is 40%: you have room to be wrong.",
      ruleOfThumb:
        "The more uncertain your estimate, the bigger the margin you need. The estimate stays yours: this glossary does not say what to do with it.",
    },
  },
  {
    id: "circle_of_competence",
    seance: 4,
    related: ["margin_of_safety"],
    fr: {
      name: "Cercle de compétence",
      short: "Savoir ce que l'on sait, et ce que l'on ne sait pas.",
      definition:
        "Le principe : connaître les limites de ce que l'on comprend. On s'intéresse aux entreprises dont on saisit le métier, au point de pouvoir l'expliquer à un enfant de 10 ans (ELI10, « Explain Like I'm 10 »).",
      example:
        "Vous comprenez comment un café gagne de l'argent : des clients, un prix, des coûts. Vous ne savez pas comment une biotech fait valider un médicament ? Cette entreprise est, pour l'instant, hors de votre cercle.",
      ruleOfThumb:
        "Si vous ne pouvez pas expliquer en deux phrases comment l'entreprise gagne de l'argent, vous êtes probablement hors de votre cercle. Une opportunité hors du cercle ressemble davantage à un billet de loterie qu'à un investissement.",
    },
    en: {
      name: "Circle of competence",
      short: "Knowing what you know, and what you don't.",
      definition:
        'The principle: know the limits of what you understand. You look at companies whose business you grasp well enough to explain it to a 10-year-old (ELI10, "Explain Like I\'m 10").',
      example:
        "You understand how a café makes money: customers, a price, costs. You have no idea how a biotech gets a drug approved? That company is, for now, outside your circle.",
      ruleOfThumb:
        "If you cannot explain in two sentences how the company makes money, you are probably outside your circle. An opportunity outside the circle looks more like a lottery ticket than an investment.",
    },
  },
  {
    id: "dcf",
    seance: 2,
    related: ["free_cash_flow", "intrinsic_value", "margin_of_safety"],
    fr: {
      name: "Actualisation des flux de trésorerie (DCF)",
      short: "Estimer ce que vaut une entreprise d'après son cash futur.",
      definition:
        "Une méthode pour estimer la valeur d'une entreprise : on additionne les flux de trésorerie qu'elle devrait produire dans le futur, puis on les « actualise », car 1 $ aujourd'hui ne vaut pas 1 $ dans 5 ans (la valeur temps de l'argent). En anglais : DCF (Discounted Cash Flow).",
      formula:
        "Valeur ≈ somme des flux futurs, chacun ramené à sa valeur d'aujourd'hui",
      example:
        "1 $ aujourd'hui peut être placé et rapporter ; 1 $ reçu dans 5 ans, non. C'est pourquoi les flux lointains pèsent moins lourd dans l'estimation.",
      ruleOfThumb:
        "Le résultat dépend beaucoup des hypothèses (croissance, taux d'actualisation) : un petit changement d'hypothèse change beaucoup la valeur. C'est une estimation, pas un fait.",
    },
    en: {
      name: "Discounted cash flow (DCF)",
      short: "Estimating what a company is worth from its future cash.",
      definition:
        'A method to estimate the value of a company: add up the cash flows it should produce in the future, then "discount" them, because $1 today is not worth $1 in 5 years (the time value of money). In French: actualisation des flux de trésorerie.',
      formula:
        "Value ≈ sum of future flows, each brought back to today's value",
      example:
        "$1 today can be invested and earn something; $1 received in 5 years cannot. That is why distant flows weigh less in the estimate.",
      ruleOfThumb:
        "The result depends heavily on the assumptions (growth, discount rate): a small change of assumption changes the value a lot. It is an estimate, not a fact.",
    },
  },
  {
    id: "intrinsic_value",
    seance: 2,
    related: ["dcf", "margin_of_safety", "analyst_target"],
    fr: {
      name: "Valeur intrinsèque",
      short: "Ce que vaut l'entreprise, à distinguer du prix du marché.",
      definition:
        "Ce que vaut réellement une entreprise d'après ses profits et ses flux de trésorerie futurs, par opposition au prix du marché, qui est ce que les acheteurs paient aujourd'hui. Les deux existent toujours et peuvent être très différents. Selon Benjamin Graham, à court terme le marché est une machine à voter, à long terme une balance.",
      example:
        "Le prix de marché d'une action change chaque seconde. La valeur intrinsèque, elle, est une estimation que chacun fait de son côté, avec ses propres hypothèses.",
      ruleOfThumb:
        "Deux personnes sérieuses peuvent estimer des valeurs intrinsèques très différentes. C'est pour cela qu'on parle de marge de sécurité.",
    },
    en: {
      name: "Intrinsic value",
      short: "What the company is worth, as opposed to the market price.",
      definition:
        "What a company is really worth, based on its profits and future cash flows, as opposed to the market price, which is what buyers pay today. Both always exist and can be far apart. According to Benjamin Graham, in the short run the market is a voting machine, in the long run a weighing machine.",
      example:
        "The market price of a share changes every second. The intrinsic value is an estimate each person makes on their own, with their own assumptions.",
      ruleOfThumb:
        "Two serious people can estimate very different intrinsic values. That is why people talk about a margin of safety.",
    },
  },
  {
    id: "ticker",
    seance: 4,
    related: ["market_cap"],
    fr: {
      name: "Symbole boursier (ticker)",
      short: "Le nom court qui identifie une entreprise cotée.",
      definition:
        "Le nom court qui identifie une entreprise cotée en bourse, généralement de 3 ou 4 lettres, écrit sous la forme MARCHÉ:TICKER.",
      formula: "MARCHÉ:TICKER",
      example:
        "Apple s'écrit NASDAQ:AAPL, Coca-Cola NYSE:KO, Microsoft NASDAQ:MSFT. Sur StockLens, les entreprises cotées à Paris portent le suffixe .PA (par exemple MC.PA).",
      ruleOfThumb:
        "Une même entreprise peut être cotée sur plusieurs places, avec des devises différentes. Vérifiez toujours la place de cotation et la devise affichées.",
    },
    en: {
      name: "Ticker symbol",
      short: "The short name that identifies a listed company.",
      definition:
        "The short name that identifies a company listed on a stock exchange, usually 3 or 4 letters, written as EXCHANGE:TICKER.",
      formula: "EXCHANGE:TICKER",
      example:
        "Apple is written NASDAQ:AAPL, Coca-Cola NYSE:KO, Microsoft NASDAQ:MSFT. On StockLens, companies listed in Paris carry the suffix .PA (for example MC.PA).",
      ruleOfThumb:
        "The same company can be listed on several exchanges, in different currencies. Always check the exchange and the currency shown.",
    },
  },
  {
    id: "hindsight_bias",
    seance: 2,
    related: ["opportunity_cost", "circle_of_competence"],
    fr: {
      name: "Biais rétrospectif (hindsight bias)",
      short: "Trouver un résultat « évident » après coup.",
      definition:
        "L'impression, une fois le résultat connu, qu'il était évident et prévisible : on oublie qu'on était incertain avant. On parle aussi d'illusion de la prévisibilité rétrospective. En anglais : hindsight bias.",
      example:
        "Après coup, la chute d'une entreprise au P/E très élevé « semble évidente ». Mais étiez-vous sûr de vous avant, ou était-ce un pari ?",
      ruleOfThumb:
        "Écrivez votre raisonnement et votre degré de certitude avant de connaître le résultat, puis relisez-les après.",
    },
    en: {
      name: "Hindsight bias",
      short: 'Finding an outcome "obvious" after the fact.',
      definition:
        "The impression, once the result is known, that it was obvious and predictable: we forget how uncertain we were before. In French: biais rétrospectif.",
      example:
        'Looking back, the fall of a company with a very high P/E "seems obvious". But were you sure beforehand, or was it a bet?',
      ruleOfThumb:
        "Write down your reasoning and how sure you are before you know the result, then reread it afterwards.",
    },
  },
  {
    id: "opportunity_cost",
    seance: 2,
    related: ["hindsight_bias", "intrinsic_value"],
    fr: {
      name: "Coût d'opportunité",
      short: "Ce à quoi on renonce en faisant un choix.",
      definition:
        "Ce à quoi l'on renonce en faisant un choix. Un euro investi quelque part est un euro qui n'est pas ailleurs : un résultat se juge par rapport aux autres options possibles. En anglais : opportunity cost.",
      example:
        "Un placement qui gagne 6 % en un an est un bon résultat face à un autre qui perd 19 %, mais modeste face à un troisième qui gagne 100 %.",
      ruleOfThumb:
        "Avant de juger une option, demandez-vous : par rapport à quoi ?",
    },
    en: {
      name: "Opportunity cost",
      short: "What you give up by making a choice.",
      definition:
        "What you give up by making a choice. A euro invested in one place is a euro that is not somewhere else: a result is judged against the other options. In French: coût d'opportunité.",
      example:
        "An investment that gains 6% in a year is a good result next to one that loses 19%, but a modest one next to a third that gains 100%.",
      ruleOfThumb:
        "Before judging an option, ask yourself: compared with what?",
    },
  },
];

const BY_ID = new Map<string, GlossaryEntry>(GLOSSARY.map((e) => [e.id, e]));

export const GLOSSARY_ENTRY_IDS: readonly GlossaryId[] = GLOSSARY.map(
  (e) => e.id,
);

export function isGlossaryId(id: unknown): id is GlossaryId {
  return typeof id === "string" && BY_ID.has(id);
}

export function getEntry(id: GlossaryId): GlossaryEntry {
  return BY_ID.get(id) as GlossaryEntry;
}

/** Normalise an app locale to a glossary language (anything unknown reads as French, the default). */
export function glossaryLocale(locale: string): GlossaryLocale {
  return locale === "en" ? "en" : "fr";
}

export function getText(id: GlossaryId, locale: string): GlossaryText {
  return getEntry(id)[glossaryLocale(locale)];
}

/** The key cards on the stock page use their own ids; this maps them to the glossary. */
export const CARD_TERM: Readonly<Record<string, GlossaryId>> = {
  eps: "eps",
  pe: "pe",
  revenue: "revenue",
  operating: "operating_margin",
  fcf: "free_cash_flow",
  marketCap: "market_cap",
};

export function termForCard(cardId: string): GlossaryEntry | null {
  const id = CARD_TERM[cardId];
  return id ? getEntry(id) : null;
}

/** Entries sorted A to Z by their display name in `locale` (accents and case ignored). */
export function sortedGlossary(locale: string): GlossaryEntry[] {
  const lang = glossaryLocale(locale);
  return [...GLOSSARY].sort((a, b) =>
    a[lang].name.localeCompare(b[lang].name, lang, { sensitivity: "base" }),
  );
}

/** Terms matching a search query in name, short line or definition (empty query = everything). */
export function searchGlossary(
  entries: readonly GlossaryEntry[],
  query: string,
  locale: string,
): GlossaryEntry[] {
  const lang = glossaryLocale(locale);
  return entries.filter((e) => {
    const t = e[lang];
    return matchesQuery(`${t.name} ${t.short} ${t.definition} ${e.id}`, query);
  });
}

/** The Paris calendar day of `date` as a whole number of days (stable for server and browser). */
export function parisDayNumber(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const n = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Math.floor(Date.UTC(n("year"), n("month") - 1, n("day")) / 86_400_000);
}

/**
 * The "term of the day": the same term for everyone on the same (Paris) calendar day, walking
 * through the whole glossary before repeating. No randomness, no stored state.
 */
export function termOfTheDay(date: Date = new Date()): GlossaryEntry {
  const day = parisDayNumber(date);
  return GLOSSARY[
    ((day % GLOSSARY.length) + GLOSSARY.length) % GLOSSARY.length
  ];
}
