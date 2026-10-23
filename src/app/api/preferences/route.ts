import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { preferencesSchema, readSettings } from "@/lib/preferences";
import type { Database } from "@/lib/supabase/database.types";

type UserUpdate = Database["public"]["Tables"]["users"]["Update"];

/** Update one or more account preferences. */
export async function PATCH(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, preferencesSchema);
  if ("response" in parsed) return parsed.response;

  const update: UserUpdate = {};
  if (parsed.data.pinStyle) update.pin_style = parsed.data.pinStyle;
  if (parsed.data.introSeenOn) update.intro_seen_on = parsed.data.introSeenOn;
  if (Object.keys(update).length > 0) {
    const { data, error } = await ctx.supabase.from("users").update(update).eq("id", ctx.userId).select("id").maybeSingle();
    if (error) return dbError(error);
    if (!data) return apiError(404, "not_found", "Account not found.");
  }
  if (parsed.data.settings) {
    const { data, error } = await ctx.supabase.rpc("update_user_settings", { patch: parsed.data.settings });
    if (error) return dbError(error);
    if (data === null) return apiError(404, "not_found", "Account not found.");
  }

  const { data, error } = await ctx.supabase.from("users").select("pin_style, settings").eq("id", ctx.userId).maybeSingle();
  if (error) return dbError(error);
  if (!data) return apiError(404, "not_found", "Account not found.");
  return jsonResponse({ pinStyle: data.pin_style, settings: readSettings(data.settings) });
}
