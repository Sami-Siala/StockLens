import { cn } from "@/lib/utils";

/** Calm placeholder block. Pulses only when the user has not asked for reduced motion. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "motion-safe:animate-pulse rounded-lg bg-surface",
        className,
      )}
    />
  );
}
