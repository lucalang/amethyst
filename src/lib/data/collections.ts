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

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * A collection by id, readable slug, legacy slug (anime/games/other) or a slug it had
 * before a rename. Callers redirect whenever the param is not the current slug.
 */
export async function loadCollection(ctx: AuthContext, param: string) {
  const collections = await loadCollections(ctx);
  if (z.uuid().safeParse(param).success) return collections.find((collection) => collection.id === param) ?? null;
  const match =
    collections.find((collection) => collection.slug === param) ??
    collections.find((collection) => collection.legacy_slug === param);
  if (match) return match;
  const target = await resolveRedirect(ctx, "collection", param);
  return target ? (collections.find((collection) => collection.id === target) ?? null) : null;
}

/** Where an old slug of a renamed page points now. */
const resolveRedirect = cache(async (ctx: AuthContext, kind: "collection" | "entry", slug: string) => {
  if (!SLUG_PATTERN.test(slug)) return null;
  const { data } = await ctx.supabase
    .from("slug_redirects")
    .select("target_id")
    .eq("user_id", ctx.userId)
    .eq("kind", kind)
    .eq("slug", slug)
    .maybeSingle();
  return data?.target_id ?? null;
});

/** An entry's address fields by id, current slug or a previous slug, within the signed-in account. */
export const resolveEntry = cache(async (ctx: AuthContext, param: string) => {
  const entries = () => ctx.supabase.from("entries").select("id, slug, collection_id").eq("user_id", ctx.userId);
  if (z.uuid().safeParse(param).success) return (await entries().eq("id", param).maybeSingle()).data;
  if (!SLUG_PATTERN.test(param)) return null;
  const { data } = await entries().eq("slug", param).maybeSingle();
  if (data) return data;
  const target = await resolveRedirect(ctx, "entry", param);
  return target ? (await entries().eq("id", target).maybeSingle()).data : null;
});