import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { ApiError } from "@/lib/contract";
import { getStore } from "./cache";
import { ProviderError } from "./errors";
import { checkRateLimit } from "./ratelimit";

const BASE_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow",
  "Content-Type": "application/json; charset=utf-8",
} as const;

export function json(
  body: unknown,
  init: {
    status?: number;
    headers?: Record<string, string>;
    cache?: string;
  } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      ...BASE_HEADERS,
      "Cache-Control": init.cache ?? "private, no-store",
      ...init.headers,
    },
  });
}

export function apiError(
  code: ApiError["error"]["code"],
  message: string,
  status: number,
  retryAfter?: number,
): Response {
  const body: ApiError = {
    error: { code, message, ...(retryAfter ? { retryAfter } : {}) },
  };
  return json(body, {
    status,
    headers: retryAfter ? { "Retry-After": String(retryAfter) } : {},
  });
}

/** Provider failures -> typed HTTP errors. Never leaks upstream details. */
export function providerErrorResponse(e: unknown): Response {
  if (e instanceof ProviderError) {
    if (e.kind === "not_found")
      return apiError("not_found", "Unknown symbol.", 404);
    return apiError(
      "upstream_unavailable",
      "The market data source is unavailable right now. Please try again in a minute.",
      502,
    );
  }
  return apiError("internal", "Unexpected error.", 500);
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || "unknown";
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Origin/Referer check (PLAN §7). This is a deterrent against casual embedding of our /api by
 * other sites and scripts, NOT authentication: non-browser clients can send any header.
 * Allowed: same-origin fetches (Sec-Fetch-Site), a matching Origin/Referer host, hosts listed in
 * ALLOWED_ORIGINS, and our own Vercel hostnames.
 */
export function isAllowedOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site === "same-origin" || site === "none") return true;
  const self = (
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    hostOf(req.url) ??
    ""
  ).toLowerCase();
  const allowed = new Set<string>(
    [
      self,
      process.env.VERCEL_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
      ...(process.env.ALLOWED_ORIGINS?.split(",") ?? []),
    ]
      .map((h) =>
        h
          ?.trim()
          .toLowerCase()
          .replace(/^https?:\/\//, ""),
      )
      .filter((h): h is string => !!h),
  );
  const origin = hostOf(req.headers.get("origin"));
  const referer = hostOf(req.headers.get("referer"));
  const seen = origin ?? referer;
  return seen !== null && allowed.has(seen);
}

const digest = (s: string) => createHash("sha256").update(s).digest();

export const CLUB_COOKIE = "stocklens_club";

/** Optional shared club code (PLAN §10 Q9). Off when CLUB_CODE is empty. */
export function clubCodeOk(req: Request): boolean {
  const expected = process.env.CLUB_CODE;
  if (!expected) return true;
  const cookie = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${CLUB_COOKIE}=`))
    ?.slice(CLUB_COOKIE.length + 1);
  const given = cookie ? decodeURIComponent(cookie) : "";
  return timingSafeEqual(digest(given), digest(expected));
}

export interface GuardOptions {
  /** Require a matching Origin/Referer (default true; /api/health skips it). */
  origin?: boolean;
  /** Require the club code when CLUB_CODE is set (default true). */
  club?: boolean;
  limit?: number;
  bucket?: string;
}

/**
 * Run the cheap checks before any work: club code, origin, per-IP rate limit.
 * Returns an error Response to send, or null when the request may proceed.
 */
export async function guard(
  req: Request,
  opts: GuardOptions = {},
): Promise<Response | null> {
  if ((opts.club ?? true) && !clubCodeOk(req))
    return apiError("unauthorized", "Club code required.", 401);
  if ((opts.origin ?? true) && !isAllowedOrigin(req))
    return apiError(
      "forbidden",
      "Requests must come from the StockLens site.",
      403,
    );
  const rl = await checkRateLimit(getStore(), clientIp(req), {
    limit: opts.limit,
    bucket: opts.bucket,
  });
  if (!rl.allowed)
    return apiError("rate_limited", "Too many requests.", 429, rl.retryAfter);
  return null;
}
