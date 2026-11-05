/**
 * GET /api/search?q=lvmh -> SearchResponse (+ meta). Autocomplete source, cached 24 h per query.
 */
import "server-only";
import {
  apiError,
  guard,
  json,
  providerErrorResponse,
} from "@/lib/providers/http";
import { getService } from "@/lib/providers/runtime";
import { SearchQuerySchema } from "@/lib/providers/schemas";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const blocked = await guard(request);
  if (blocked) return blocked;

  const q = SearchQuerySchema.safeParse(
    new URL(request.url).searchParams.get("q") ?? "",
  );
  if (!q.success)
    return apiError("bad_request", "Query `q` must be 1-60 characters.", 400);

  try {
    return json(await getService().search(q.data), {
      cache: "private, max-age=60",
    });
  } catch (e) {
    return providerErrorResponse(e);
  }
}
