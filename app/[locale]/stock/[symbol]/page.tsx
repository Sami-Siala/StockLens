import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { PageShell } from "@/components/page-shell";
import { StockView } from "@/components/stock/stock-view";

export default function StockPage({
  params,
}: PageProps<"/[locale]/stock/[symbol]">) {
  const { locale, symbol } = use(params);
  setRequestLocale(locale);
  // Tickers like ^GSPC arrive percent-encoded.
  let decoded = symbol;
  try {
    decoded = decodeURIComponent(symbol);
  } catch {
    /* keep the raw segment: the data layer answers "not found" */
  }
  return (
    <PageShell>
      <StockView key={decoded.toUpperCase()} symbol={decoded.toUpperCase()} />
    </PageShell>
  );
}
