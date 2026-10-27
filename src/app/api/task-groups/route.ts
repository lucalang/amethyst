import { dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { GROUP_COLUMNS, mapGroup } from "@/lib/tasks/model";
import { createGroupSchema } from "@/lib/validation/tasks";

export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, createGroupSchema);
  if ("response" in parsed) return parsed.response;
  const { data, error } = await ctx.supabase.from("task_groups").insert({ name: parsed.data.name }).select(GROUP_COLUMNS).single();
  if (error) return dbError(error, "Could not create the group.");
  return jsonResponse({ group: mapGroup(data) }, { status: 201 });
}
