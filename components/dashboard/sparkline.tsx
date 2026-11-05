import { cn } from "@/lib/utils";

const W = 100;
const H = 32;
const PAD = 2;

/** SVG points for a series, scaled into the viewBox. Flat series draw a centred line. */
export function sparklinePoints(values: number[]): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * W;
      const y =
        span === 0 ? H / 2 : PAD + (1 - (v - min) / span) * (H - 2 * PAD);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/**
 * Tiny trend line (about six weeks of closes). Decorative: the numbers next to it carry the
 * meaning, so it is hidden from assistive tech. Neutral colour on purpose: up / down colour is
 * reserved for the change figure, which is always paired with an arrow.
 */
export function Sparkline({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={cn("h-8 w-16 shrink-0 text-muted", className)}
    >
      <polyline
        points={sparklinePoints(values)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
