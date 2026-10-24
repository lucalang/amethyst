import { z } from "zod";
import { isKnownIcon } from "@/components/categories/collection-icon";
import { COLLECTION_COLUMNS, collectionColumns, collectionInputSchema } from "@/lib/collections";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { refreshArchiveAchievements } from "@/lib/data/achievements";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "Collection not found.");
  const parsed = await parseJson(request, collectionInputSchema);
  if ("response" in parsed) return parsed.response;
  if (parsed.data.icon && !isKnownIcon(parsed.data.icon)) return apiError(422, "invalid_input", "Choose an icon from the list.");
  const { data: before, error: beforeError } = await ctx.supabase.from("collections").select("icon, accent_color, banner_url").eq("id", id).maybeSingle();
  if (beforeError) return dbError(beforeError);
  if (!before) return apiError(404, "not_found", "Collection not found.");
  const { data, error } = await ctx.supabase.from("collections").update(collectionColumns(parsed.data)).eq("id", id).select(COLLECTION_COLUMNS).maybeSingle();
  if (error?.code === "23505") return apiError(409, "name_taken", "You already have a collection with that name.");
  if (error?.code === "23503") return apiError(404, "not_found", "That template no longer exists. Choose another one.");
  if (error) return dbError(error);
  if (!data) return apiError(404, "not_found", "Collection not found.");
  const explicitlyCustomized = (parsed.data.icon !== undefined && parsed.data.icon !== before.icon && parsed.data.icon !== null)
    || (parsed.data.accentColor !== undefined && parsed.data.accentColor !== before.accent_color && parsed.data.accentColor !== null)
    || (parsed.data.bannerUrl !== undefined && parsed.data.bannerUrl !== before.banner_url && parsed.data.bannerUrl !== null);
  const achievementUnlocks = explicitlyCustomized ? await refreshArchiveAchievements(ctx) : [];
  return jsonResponse({ collection: data, achievementUnlocks });
}

const deleteSchema = z.object({ expectedEntries: z.number().int().min(0) }).strict();

/**
 * Delete a collection with its entries and their workspaces. `expectedEntries` is
 * the count the user confirmed; the database refuses if it no longer matches.
 */
export async function DELETE(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "Collection not found.");
  const parsed = await parseJson(request, deleteSchema);
  if ("response" in parsed) return parsed.response;
  const { data, error } = await ctx.supabase.rpc("delete_collection", { p_collection_id: id, p_expected_entries: parsed.data.expectedEntries });
  if (error?.code === "P0002") return apiError(404, "not_found", "Collection not found.");
  if (error) return dbError(error);
  return jsonResponse({ deleted: true, entries: data ?? 0 });
}