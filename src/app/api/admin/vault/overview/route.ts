import { requireAdminApi } from "@/lib/admin";
import { loadAdminSnapshot } from "@/lib/data/vault-admin";
import { apiError, jsonResponse } from "@/lib/http";

/** Codes, drafts and stats for the dashboard; the timeline is bucketed by the given time zone. */
export async function GET(request: Request) {
  const ctx = await requireAdminApi();
  if (ctx instanceof Response) return ctx;
  const timeZone = new URL(request.url).searchParams.get("tz") ?? "UTC";
  try {
    return jsonResponse(await loadAdminSnapshot(ctx, timeZone));
  } catch {
    return apiError(500, "server_error", "The dashboard couldn’t refresh. Try again.");
  }
}
