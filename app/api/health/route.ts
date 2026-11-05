/**
 * GET /api/health -> HealthReport. Per-provider status and last success, no secrets.
 * No Origin check (a status page / uptime monitor must be able to read it), but still rate-limited.
 */
import "server-only";
import { guard, json } from "@/lib/providers/http";
import { getService } from "@/lib/providers/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = await guard(request, { origin: false, club: false });
  if (blocked) return blocked;
  return json(await getService().health());
}
