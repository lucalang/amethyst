import "server-only";
import { cache } from "react";
import { DEFAULT_PIN_STYLE, isPinStyle, readSettings, type Preferences } from "@/lib/preferences";
import type { AuthContext } from "@/lib/supabase/auth";

/** The signed-in account's profile row, read once per request and shared by the shell, preferences and Home. */
export const loadProfile = cache(async (ctx: AuthContext) => {
  const { data, error } = await ctx.supabase
    .from("users")
    .select("display_name, avatar_url, avatar_decoration, profile_badge, profile_title, intro_seen_on, motto, pin_style, settings")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (error) throw new Error(`Query failed (${error.code ?? "unknown"})`);
  return data;
});

/** The signed-in account's preferences (defaults when the profile is unavailable). */
export const loadPreferences = cache(async (ctx: AuthContext): Promise<Preferences> => {
  const data = await loadProfile(ctx).catch(() => null);
  return { ...readSettings(data?.settings), pinStyle: isPinStyle(data?.pin_style) ? data.pin_style : DEFAULT_PIN_STYLE };
});
