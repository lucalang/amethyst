import { z } from "zod";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { customTabsSchema } from "@/lib/validation/entries";

const schema = z.object({ tabs: customTabsSchema });

// Replace the ordered tab list (validated here and again by a database CHECK).
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "Entry not found.");
  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;

  const { data, error } = await ctx.supabase.rpc("save_custom_tabs", { p_entry_id: id, p_tabs: parsed.data.tabs });
  if (error) return dbError(error);
  return jsonResponse({ tabs: data.tabs });
}
