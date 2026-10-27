import { dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { LIST_COLUMNS, mapList } from "@/lib/tasks/model";
import { createListSchema } from "@/lib/validation/tasks";

export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, createListSchema);
  if ("response" in parsed) return parsed.response;
  const { name, groupId, icon, accentColor } = parsed.data;
  const { data, error } = await ctx.supabase
    .from("task_lists")
    .insert({ name, group_id: groupId ?? null, icon: icon ?? null, accent_color: accentColor ?? null })
    .select(LIST_COLUMNS)
    .single();
  if (error) return dbError(error, "Could not create the list.");
  return jsonResponse({ list: mapList(data) }, { status: 201 });
}
