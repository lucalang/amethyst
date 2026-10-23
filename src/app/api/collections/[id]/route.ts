import { z } from "zod";
import { collectionInputSchema } from "@/lib/collections";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

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
  const { data, error } = await ctx.supabase.from("collections").update(parsed.data).eq("id", id).select("id, name, description").maybeSingle();
  if (error?.code === "23505") return apiError(409, "name_taken", "You already have a collection with that name.");
  if (error) return dbError(error);
  if (!data) return apiError(404, "not_found", "Collection not found.");
  return jsonResponse({ collection: data });
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