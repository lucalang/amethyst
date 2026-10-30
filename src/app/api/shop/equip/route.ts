import { z } from "zod";
import { EQUIP_ITEM_IDS, rewardItemInfo, type EquipItemId } from "@/lib/cosmetics";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

const equipSchema = z
  .object({
    /** An owned item to wear; null takes the item off the chosen slot (defaults to avatar_decoration). */
    item: z.enum(EQUIP_ITEM_IDS as [EquipItemId, ...EquipItemId[]]).nullable(),
    slot: z.enum(["avatar_decoration", "badge", "title", "frame"]).optional(),
  })
  .strict();

/**
 * Equip an owned cosmetic, badge or title: a frame becomes the account's default frame (entries with
 * their own frame keep it), while decorations, badges and titles go on the profile. Ownership is
 * enforced by database triggers.
 */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, equipSchema);
  if ("response" in parsed) return parsed.response;
  const { item, slot } = parsed.data;
  const kind = item ? rewardItemInfo(item).kind : (slot ?? "avatar_decoration");

  if (kind === "frame") {
    const { data, error } = await ctx.supabase.rpc("update_user_settings", { patch: { artworkFrame: item ?? "none" } });
    if (error) return dbError(error, "Could not equip that frame.");
    if (data === null) return apiError(404, "not_found", "Account not found.");
  } else {
    const column = kind === "badge" ? "profile_badge" : kind === "title" ? "profile_title" : "avatar_decoration";
    const { data, error } = await ctx.supabase
      .from("users")
      .update({ [column]: item })
      .eq("id", ctx.userId)
      .select("id")
      .maybeSingle();
    if (error) return dbError(error, "Could not equip that item.");
    if (!data) return apiError(404, "not_found", "Account not found.");
  }
  return jsonResponse({ equipped: item, kind });
}
