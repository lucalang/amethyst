import { z } from "zod";
import { entryCategoriesSchema } from "@/lib/categories";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

/** Replace an entry's categories without touching the entry or its workspace. */
export async function PUT(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "Entry not found.");
  const parsed = await parseJson(request, entryCategoriesSchema);
  if ("response" in parsed) return parsed.response;

  const { data, error } = await ctx.supabase.rpc("set_entry_categories", { p_entry_id: id, p_category_ids: parsed.data.categoryIds });
  if (error) return dbError(error);
  return jsonResponse({ categoryIds: data ?? [] });
}
