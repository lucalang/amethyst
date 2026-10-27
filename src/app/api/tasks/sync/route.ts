import { z } from "zod";
import { apiError, dbError, jsonResponse, requireApiUser } from "@/lib/http";
import { mapChanges } from "@/lib/tasks/model";

const sinceSchema = z.iso.datetime({ offset: true }).nullable();

/** Rows changed since `?since=` (the `now` of the previous response); a full snapshot without it. */
export async function GET(request: Request) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const since = sinceSchema.safeParse(new URL(request.url).searchParams.get("since") || null);
  if (!since.success) return apiError(422, "invalid_input", "Invalid sync cursor.");
  const { data, error } = await ctx.supabase.rpc("task_changes", { p_since: since.data });
  if (error) return dbError(error, "Could not sync tasks.");
  return jsonResponse(mapChanges(data));
}
