import "server-only";
import { collectionPath, entryPath } from "@/lib/collections";
import type { AuthContext } from "@/lib/supabase/auth";
import { loadPreferences } from "./preferences";

/** Where the app opens, per Settings → General; Home whenever the chosen place no longer exists. */
export async function startupPath(ctx: AuthContext): Promise<string> {
  const { startup, startupCollectionId } = await loadPreferences(ctx);
  const { supabase } = ctx;

  if (startup === "collection" && startupCollectionId) {
    const { data } = await supabase.from("collections").select("id, slug").eq("id", startupCollectionId).maybeSingle();
    if (data) return collectionPath(data);
  }

  if (startup === "last") {
    const { data: visit } = await supabase
      .from("entry_visits")
      .select("entry_id, last_file_id")
      .order("visited_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (visit) {
      const [{ data: entry }, { data: file }] = await Promise.all([
        supabase.from("entries").select("id, slug").eq("id", visit.entry_id).maybeSingle(),
        visit.last_file_id
          ? supabase.from("workspace_nodes").select("id").eq("id", visit.last_file_id).eq("entry_id", visit.entry_id).neq("kind", "folder").maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (entry) return file ? `${entryPath(entry)}?file=${file.id}` : entryPath(entry);
    }
  }

  return "/";
}
