import { z } from "zod";
import { COLLECTION_LAYOUT_IDS } from "@/lib/collection-layouts";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

const layoutSchema = z.object({ layout: z.enum(COLLECTION_LAYOUT_IDS) }).strict();

/** Save how one of the account's collections is laid out (it never affects other collections). */
export async function PUT(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "Collection not found.");
  const parsed = await parseJson(request, layoutSchema);
  if ("response" in parsed) return parsed.response;
  const { data, error } = await ctx.supabase
    .from("collections")
    .update({ layout: parsed.data.layout })
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .select("id, layout")
    .maybeSingle();
  if (error) return dbError(error);
  if (!data) return apiError(404, "not_found", "Collection not found.");
  return jsonResponse({ layout: data.layout });
}
