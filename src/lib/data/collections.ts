import "server-only";
import { cache } from "react";
import { z } from "zod";
import { COLLECTION_COLUMNS } from "@/lib/collections";
import type { AuthContext } from "@/lib/supabase/auth";
import { fetchAll } from "./fetch-all";

/** The user's collections in their saved order. */
export const loadCollections = cache(async (ctx: AuthContext) =>
  fetchAll((from, to) =>
    ctx.supabase.from("collections").select(`${COLLECTION_COLUMNS}, legacy_slug`).order("position").order("created_at").order("id").range(from, to),
  ),
);

/** Number of entries per category id (categories without entries are absent). */
export const loadCollectionEntryCounts = cache(async (ctx: AuthContext) => {
  const rows = await fetchAll((from, to) => ctx.supabase.from("entries").select("collection_id").order("id").range(from, to), 200_000);
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.collection_id] = (counts[row.collection_id] ?? 0) + 1;
  return counts;
});

export async function loadCollection(ctx: AuthContext, id: string) {
  const collections = await loadCollections(ctx);
  const isId = z.uuid().safeParse(id).success;
  return collections.find((collection) => isId ? collection.id === id : collection.legacy_slug === id) ?? null;
}