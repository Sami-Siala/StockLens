/**
 * POST /api/club {code} -> sets the club-code cookie when CLUB_CODE is configured (PLAN §10 Q9).
 * When CLUB_CODE is empty the gate is off and this answers 204 without setting anything.
 * Brute-force limited to 10 attempts/min/IP.
 */
import "server-only";
import { timingSafeEqual, createHash } from "node:crypto";
import { z } from "zod";
import { apiError, CLUB_COOKIE, guard } from "@/lib/providers/http";

export const dynamic = "force-dynamic";

const Body = z.object({ code: z.string().min(1).max(100) });
const digest = (s: string) => createHash("sha256").update(s).digest();

export async function POST(request: Request) {
  const blocked = await guard(request, {
    club: false,
    limit: 10,
    bucket: "club",
  });
  if (blocked) return blocked;

  const expected = process.env.CLUB_CODE;
  if (!expected) return new Response(null, { status: 204 });

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return apiError("bad_request", "Body must be {code}.", 400);
  if (!timingSafeEqual(digest(body.data.code), digest(expected)))
    return apiError("unauthorized", "Wrong club code.", 401);

  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return new Response(null, {
    status: 204,
    headers: {
      "X-Robots-Tag": "noindex, nofollow",
      "Set-Cookie": `${CLUB_COOKIE}=${encodeURIComponent(expected)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`,
    },
  });
}
