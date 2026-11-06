import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { TickerBand } from "./ticker/ticker-band";

export function PageShell({
  children,
  home = false,
  narrow = false,
}: {
  children: ReactNode;
  home?: boolean;
  narrow?: boolean;
}) {
  return (
    <>
      <SiteHeader home={home} />
      <TickerBand />
      <main
        className={cn(
          "mx-auto flex w-full flex-1 flex-col px-4 pb-8",
          // Air between the market band and the page title (the home page sets its own top spacing).
          !home && "pt-6 md:pt-8",
          narrow ? "max-w-3xl" : "max-w-5xl",
        )}
      >
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
