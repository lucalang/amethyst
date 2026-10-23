import "server-only";
import { cache } from "react";
import { DEFAULT_PIN_STYLE, isPinStyle, type Preferences } from "@/lib/preferences";
import type { AuthContext } from "@/lib/supabase/auth";

/** The signed-in account's display preferences (defaults when the profile is unavailable). */
export const loadPreferences = cache(async (ctx: AuthContext): Promise<Preferences> => {
  const { data } = await ctx.supabase.from("users").select("pin_style").eq("id", ctx.userId).maybeSingle();
  return { pinStyle: isPinStyle(data?.pin_style) ? data.pin_style : DEFAULT_PIN_STYLE };
});
