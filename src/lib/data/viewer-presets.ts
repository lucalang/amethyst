import "server-only";
import { cache } from "react";
import type { AuthContext } from "@/lib/supabase/auth";
import { readViewerLook, type CustomViewerPreset } from "@/lib/viewer-looks";

/** The account's saved 3D Showcase presets, by name. */
export const loadViewerPresets = cache(async (ctx: AuthContext): Promise<CustomViewerPreset[]> => {
  const { data } = await ctx.supabase.from("viewer_presets").select("id, name, look").eq("user_id", ctx.userId).order("name");
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, look: readViewerLook(row.look) }));
});
