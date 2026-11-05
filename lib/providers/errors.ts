import "server-only";

export type ProviderErrorKind =
  /** The symbol does not exist (or has no data). Safe to negative-cache. */
  | "not_found"
  /** Timeout, 429, 5xx, network failure. Serve stale if we have it. */
  | "upstream"
  /** The payload was not usable at all (shape change). */
  | "invalid_payload";

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly provider: string = "yahoo",
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Never leak upstream internals (URLs with crumbs, bodies) to clients or logs. */
export function safeMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/crumb=[^&\s"]+/g, "crumb=***").slice(0, 200);
}
