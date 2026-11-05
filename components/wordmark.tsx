import Image from "next/image";
import { cn } from "@/lib/utils";

/** Black wordmark on light, white wordmark in dark mode (both transparent WebP). */
export function Wordmark({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <>
      <Image
        src="/brand/wordmark.webp"
        alt="StockLens"
        width={1200}
        height={204}
        priority={priority}
        className={cn("h-auto dark:hidden", className)}
      />
      <Image
        src="/brand/wordmark-light.webp"
        alt=""
        aria-hidden="true"
        width={1200}
        height={204}
        priority={priority}
        className={cn("hidden h-auto dark:block", className)}
      />
    </>
  );
}
