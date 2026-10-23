import { isKnownIcon } from "@/components/categories/collection-icon";
import { COLLECTION_COLUMNS, collectionColumns, collectionInputSchema } from "@/lib/collections";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, collectionInputSchema);
  if ("response" in parsed) return parsed.response;
  if (parsed.data.icon && !isKnownIcon(parsed.data.icon)) return apiError(422, "invalid_input", "Choose an icon from the list.");
  const { data, error } = await ctx.supabase.from("collections").insert(collectionColumns(parsed.data)).select(COLLECTION_COLUMNS).single();
  if (error?.code === "23505") return apiError(409, "name_taken", "You already have a collection with that name.");
  if (error?.code === "23503") return apiError(404, "not_found", "That template no longer exists. Choose another one.");
  if (error) return dbError(error);
  return jsonResponse({ collection: data }, { status: 201 });
}