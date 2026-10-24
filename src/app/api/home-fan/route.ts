import { z } from "zod";
import { COVER_SHAPES } from "@/lib/cover-shape";
import { fanKey, MAX_FAN_ITEMS } from "@/lib/home-fan";
import { dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { artworkUrl } from "@/lib/validation/entries";

const itemSchema = z.union([
  z.object({ entryId: z.uuid() }).strict(),
  z.object({ imageUrl: artworkUrl.pipe(z.string({ error: "Add an image link or upload an image." })), shape: z.enum(COVER_SHAPES) }).strict(),
]);

const fanSchema = z
  .object({ items: z.array(itemSchema).max(MAX_FAN_ITEMS, `The cover fan holds at most ${MAX_FAN_ITEMS} pieces of artwork.`) })
  .strict()
  .refine((value) => {
    const keys = value.items.map(fanKey);
    return new Set(keys).size === keys.length;
  }, "Each entry or image can appear in the fan only once.");

/** Replace the account's cover fan with the given artwork, in order. Entries and uploads are never touched. */
export async function PUT(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, fanSchema);
  if ("response" in parsed) return parsed.response;
  const items = parsed.data.items.map((item) => ("entryId" in item ? { entry_id: item.entryId } : { image_url: item.imageUrl, image_shape: item.shape }));
  const { error } = await ctx.supabase.rpc("set_home_fan", { p_items: items });
  if (error) return dbError(error);
  return jsonResponse({ ok: true });
}
