import { z } from "zod";
import { MAX_FAN_ITEMS } from "@/lib/home-fan";
import { dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { artworkItemSchema, artworkRpcItems, uniqueArtwork } from "@/lib/validation/artwork-items";

const fanSchema = z
  .object({ items: z.array(artworkItemSchema).max(MAX_FAN_ITEMS, `The cover fan holds at most ${MAX_FAN_ITEMS} pieces of artwork.`) })
  .strict()
  .refine((value) => uniqueArtwork(value.items), "Each entry or image can appear in the fan only once.");

/** Replace the account's cover fan with the given artwork, in order. Entries and uploads are never touched. */
export async function PUT(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, fanSchema);
  if ("response" in parsed) return parsed.response;
  const { error } = await ctx.supabase.rpc("set_home_fan", { p_items: artworkRpcItems(parsed.data.items) });
  if (error) return dbError(error);
  return jsonResponse({ ok: true });
}
