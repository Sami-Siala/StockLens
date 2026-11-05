import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The wordmark with the three bars inside the "o" rising one after another (1, 2, 3), looping.
 *
 * Built from the real wordmark, cut into layers (public/brand/loader/): a bar-less base for light
 * and dark mode plus the three bars, so the letters never move. Pure CSS (globals.css, `.logo-bar`),
 * no JS. With prefers-reduced-motion the bars simply stay up: a plain, complete logo.
 * Bar geometry is in source pixels of the 1200 x 204 wordmark.
 */
const W = 1200;
const H = 204;
const BARS = [
  { n: 1, x: 282, y: 147, w: 18, h: 38 },
  { n: 2, x: 308, y: 128, w: 17, h: 63 },
  { n: 3, x: 333, y: 107, w: 20, h: 76 },
] as const;

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

export function AnimatedWordmark({
  className,
  label,
  priority = false,
}: {
  className?: string;
  /** Accessible name. Omit when the animation is decorative or a status label sits next to it. */
  label?: string;
  priority?: boolean;
}) {
  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("relative w-full", className)}
      style={{ aspectRatio: `${W} / ${H}` }}
    >
      <Image
        src="/brand/loader/base.webp"
        alt=""
        width={W}
        height={H}
        priority={priority}
        unoptimized
        className="absolute inset-0 size-full dark:hidden"
      />
      <Image
        src="/brand/loader/base-light.webp"
        alt=""
        width={W}
        height={H}
        priority={priority}
        unoptimized
        className="absolute inset-0 hidden size-full dark:block"
      />
      {BARS.map((b) => (
        <Image
          key={b.n}
          src={`/brand/loader/bar-${b.n}.png`}
          alt=""
          width={b.w}
          height={b.h}
          priority={priority}
          unoptimized
          className="logo-bar absolute"
          style={{
            left: pct(b.x, W),
            top: pct(b.y, H),
            width: pct(b.w, W),
            height: pct(b.h, H),
            animationDelay: `${(b.n - 1) * 0.16}s`,
          }}
        />
      ))}
    </div>
  );
}
