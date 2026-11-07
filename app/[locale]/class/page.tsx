import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { ClassView } from "@/components/class/class-view";
import { PageShell } from "@/components/page-shell";

/**
 * Teacher links (PLAN §6, Step 5b): `/class?tickers=KO,NVDA,MC.PA&hideAI=1&title=...`. The page is
 * static; the link is read in the browser, so there is nothing to log in to and nothing stored
 * on the server.
 */
export default function ClassPage({ params }: PageProps<"/[locale]/class">) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return (
    <PageShell narrow>
      <ClassView />
    </PageShell>
  );
}
