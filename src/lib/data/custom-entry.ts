import "server-only";
import type { AuthContext } from "@/lib/supabase/auth";
import type { Tables } from "@/lib/supabase/database.types";
import type { ProgressRow } from "@/lib/progress/derive";
import { customTabsSchema, type CustomTab } from "@/lib/validation/entries";
import { fetchAll } from "./fetch-all";

export type ChecklistItem = { id: string; title: string; tabId: string; position: number };

export type CustomEntryData = {
  entry: Tables<"entries">;
  platform: string | null;
  tabs: CustomTab[];
  items: ChecklistItem[];
  progress: ProgressRow[];
};

export async function loadCustomEntry(ctx: AuthContext, entryId: string): Promise<CustomEntryData | null> {
  const { supabase } = ctx;
  const { data: entry } = await supabase.from("entries").select("*").eq("id", entryId).in("kind", ["game", "custom"]).maybeSingle();
  if (!entry) return null;

  const [{ data: game }, links, progress] = await Promise.all([
    supabase.from("custom_games").select("platform, tabs").eq("entry_id", entryId).maybeSingle(),
    fetchAll((from, to) =>
      supabase
        .from("entry_media_items")
        .select("tab_id, position, media_items(id, title)")
        .eq("entry_id", entryId)
        .eq("section", "checklist")
        .order("position")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .rpc("entry_progress_rows", { p_entry_id: entryId })
        .select("media_item_id, is_checked, episodes_watched, episodes_mapped, status, score, version, updated_at")
        .range(from, to),
    ),
  ]);

  const tabs = customTabsSchema.safeParse(game?.tabs ?? []);
  return {
    entry,
    platform: game?.platform ?? null,
    tabs: tabs.success ? tabs.data : [],
    items: links.flatMap((link) =>
      link.media_items && link.tab_id ? [{ id: link.media_items.id, title: link.media_items.title, tabId: link.tab_id, position: link.position }] : [],
    ),
    progress: progress as ProgressRow[],
  };
}
