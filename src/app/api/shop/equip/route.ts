import { z } from "zod";
import { COSMETIC_IDS, COSMETICS, type CosmeticId } from "@/lib/cosmetics";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

const equipSchema = z
  .object({
    /** An owned item to wear; null takes the avatar decoration off. */
    item: z.enum(COSMETIC_IDS as [CosmeticId, ...CosmeticId[]]).nullable(),
  })
  .strict();

/**
 * Equip an owned cosmetic: a frame becomes the account's default frame (entries with their own
 * frame keep it), a decoration goes on the profile picture. Ownership is enforced by the database.
 */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, equipSchema);
  if ("response" in parsed) return parsed.response;
  const { item } = parsed.data;

  if (item && COSMETICS[item].kind === "frame") {
    const { data, error } = await ctx.supabase.rpc("update_user_settings", { patch: { artworkFrame: item } });
    if (error) return dbError(error, "Could not equip that frame.");
    if (data === null) return apiError(404, "not_found", "Account not found.");
  } else {
    const { data, error } = await ctx.supabase.from("users").update({ avatar_decoration: item }).eq("id", ctx.userId).select("id").maybeSingle();
    if (error) return dbError(error, "Could not equip that decoration.");
    if (!data) return apiError(404, "not_found", "Account not found.");
  }
  return jsonResponse({ equipped: item });
}
