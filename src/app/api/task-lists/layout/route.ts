import { dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { layoutSchema } from "@/lib/validation/tasks";

/** Save the complete sidebar order: groups, the lists inside them and ungrouped lists. */
export async function PUT(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, layoutSchema);
  if ("response" in parsed) return parsed.response;
  const { error } = await ctx.supabase.rpc("set_task_layout", { p_layout: parsed.data.layout });
  if (error) return dbError(error, "Could not save the order.");
  return jsonResponse({ ok: true });
}
