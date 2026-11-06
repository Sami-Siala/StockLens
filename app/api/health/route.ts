/**
 * GET /api/health -> HealthReport. Per-provider status and last success, no secrets.
 * No Origin check (a status page / uptime monitor must be able to read it), but still rate-limited.
 */
import "server-only";
import { getAiService } from "@/lib/ai/runtime";
import { guard, json } from "@/lib/providers/http";
import { getService } from "@/lib/providers/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = await guard(request, { origin: false, club: false });
  if (blocked) return blocked;
  const report = await getService().health();
  // Gemini is listed for the teacher, but never moves the overall status: the page works without it.
  const gemini = await getAiService()
    .health()
    .catch(() => null);
  return json(
    gemini ? { ...report, providers: [...report.providers, gemini] } : report,
  );
}
