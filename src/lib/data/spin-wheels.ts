import "server-only";
import type { AuthContext } from "@/lib/supabase/auth";
import { readChoices, readSettings, type SavedWheel } from "@/lib/spin-wheel";

export const SPIN_WHEEL_COLUMNS = "id, name, choices, settings, version, updated_at";

type Row = { id: string; name: string; choices: unknown; settings: unknown; version: number; updated_at: string };

export const toSavedWheel = (row: Row): SavedWheel => ({
  id: row.id,
  name: row.name,
  choices: readChoices(row.choices),
  settings: readSettings(row.settings),
  version: row.version,
  updatedAt: row.updated_at,
});

/** The signed-in user's wheels (RLS limits rows to the owner), most recently saved first. */
export async function loadSpinWheels(ctx: AuthContext): Promise<SavedWheel[]> {
  const { data, error } = await ctx.supabase.from("spin_wheels").select(SPIN_WHEEL_COLUMNS).order("updated_at", { ascending: false }).limit(100);
  if (error) throw error;
  return data.map(toSavedWheel);
}
