import { z } from "zod";
import { loadCollectionCoverChoices, MAX_COLLECTION_COVERS } from "@/lib/data/collection-covers";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { artworkItemSchema, artworkRpcItems, uniqueArtwork } from "@/lib/validation/artwork-items";

type Params = { params: Promise<{ id: string }> };

const coversSchema = z
  .object({ items: z.array(artworkItemSchema).max(MAX_COLLECTION_COVERS, `A collection shows at most ${MAX_COLLECTION_COVERS} covers.`) })
  .strict()
  .refine((value) => uniqueArtwork(value.items), "Each entry or image can be chosen only once.");

const invalidId = (id: string) => !z.uuid().safeParse(id).success;

/** The covers chosen for a collection plus the automatic artwork shown when none are chosen. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (invalidId(id)) return apiError(404, "not_found", "Collection not found.");
  const choices = await loadCollectionCoverChoices(ctx, id);
  if (!choices) return apiError(404, "not_found", "Collection not found.");
  return jsonResponse(choices);
}

/** Replace a collection's chosen covers, in order. An empty list returns it to automatic artwork. */
export async function PUT(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (invalidId(id)) return apiError(404, "not_found", "Collection not found.");
  const parsed = await parseJson(request, coversSchema);
  if ("response" in parsed) return parsed.response;
  const { error } = await ctx.supabase.rpc("set_collection_covers", { p_collection: id, p_items: artworkRpcItems(parsed.data.items) });
  if (error) return dbError(error);
  return jsonResponse({ ok: true });
}
