import "server-only";
import { loadCollections } from "@/lib/data/collections";
import type { TimeCollection, TimeEntry } from "@/lib/time-machine";
import type { AuthContext } from "@/lib/supabase/auth";
import { fetchAll } from "./fetch-all";

/**
 * What the Time Machine plots: only the signed-in account's own entries (the date each was added to the archive)
 * and collections. Nothing is invented and nothing else is read.
 */
export async function loadTimeMachine(ctx: AuthContext): Promise<{ entries: TimeEntry[]; collections: TimeCollection[] }> {
  const [rows, collections, created] = await Promise.all([
    fetchAll(
      (from, to) =>
        ctx.supabase
          .from("entries")
          .select("id, slug, collection_id, title, cover_url, cover_shape, created_at")
          .eq("user_id", ctx.userId)
          .order("created_at")
          .order("id")
          .range(from, to),
      200_000,
    ),
    loadCollections(ctx),
    fetchAll((from, to) => ctx.supabase.from("collections").select("id, created_at").eq("user_id", ctx.userId).order("id").range(from, to)),
  ]);
  const createdAt = new Map(created.map((row) => [row.id, row.created_at]));
  return {
    entries: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      collectionId: row.collection_id,
      coverUrl: row.cover_url,
      square: row.cover_shape === "square",
      createdAt: row.created_at,
    })),
    collections: collections.flatMap((collection) => {
      const at = createdAt.get(collection.id);
      return at ? [{ id: collection.id, slug: collection.slug ?? null, name: collection.name, accent: collection.accent_color ?? null, createdAt: at }] : [];
    }),
  };
}
