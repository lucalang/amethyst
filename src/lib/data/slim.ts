import "server-only";
import type { AuthContext } from "@/lib/supabase/auth";
import { loadCollectionEntryCounts, loadCollections } from "./collections";

/**
 * Data for the Slim edition's Home and Search. These read the same tables as the full app through the signed-in
 * account's own client (row-level security applies as everywhere else), but only what Slim shows: no feature,
 * reward or cosmetic data, and never every entry.
 */
export type SlimEntry = {
  id: string;
  slug: string | null;
  title: string;
  collectionId: string;
  coverUrl: string | null;
  square: boolean;
  updatedAt: string;
};

const ENTRY_COLUMNS = "id, slug, title, collection_id, cover_url, cover_shape, updated_at";

type EntryRow = { id: string; slug: string | null; title: string; collection_id: string; cover_url: string | null; cover_shape: string; updated_at: string };

const toEntry = (row: EntryRow): SlimEntry => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  collectionId: row.collection_id,
  coverUrl: row.cover_url,
  square: row.cover_shape === "square",
  updatedAt: row.updated_at,
});

function check<T>({ data, error }: { data: T | null; error: { code?: string } | null }) {
  if (error) throw new Error(`Query failed (${error.code ?? "unknown"})`);
  return data;
}

export type SlimHome = {
  collections: Awaited<ReturnType<typeof loadCollections>>;
  counts: Record<string, number>;
  /** The last entry opened, and the file that was open in it. */
  resume: { entry: SlimEntry; fileId: string | null } | null;
  pinned: SlimEntry[];
  recent: SlimEntry[];
};

export async function loadSlimHome(ctx: AuthContext): Promise<SlimHome> {
  const { supabase } = ctx;
  const [collections, counts, visits, pins, recent] = await Promise.all([
    loadCollections(ctx),
    loadCollectionEntryCounts(ctx),
    supabase.from("entry_visits").select("entry_id, last_file_id").order("visited_at", { ascending: false }).limit(1).then(check),
    supabase.from("entry_pins").select("entry_id").order("pinned_at", { ascending: false }).limit(12).then(check),
    supabase.from("entries").select(ENTRY_COLUMNS).eq("user_id", ctx.userId).order("updated_at", { ascending: false }).limit(12).then(check),
  ]);
  const wanted = [...new Set([...(visits ?? []).map((row) => row.entry_id), ...(pins ?? []).map((row) => row.entry_id)])];
  const extra = wanted.length ? ((await supabase.from("entries").select(ENTRY_COLUMNS).in("id", wanted).then(check)) ?? []) : [];
  const byId = new Map([...(recent ?? []), ...extra].map((row) => [row.id, toEntry(row as EntryRow)]));
  const visit = visits?.[0];
  return {
    collections,
    counts,
    resume: visit && byId.has(visit.entry_id) ? { entry: byId.get(visit.entry_id)!, fileId: visit.last_file_id } : null,
    pinned: (pins ?? []).flatMap((row) => (byId.has(row.entry_id) ? [byId.get(row.entry_id)!] : [])),
    recent: (recent ?? []).map((row) => toEntry(row as EntryRow)),
  };
}

/** Entries whose title contains `query` (case-insensitive), most recently changed first. */
export async function searchSlimEntries(ctx: AuthContext, query: string, limit = 60): Promise<SlimEntry[]> {
  const term = query.trim().slice(0, 100);
  if (!term) return [];
  // Escape LIKE wildcards so the words are matched literally.
  const pattern = `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  const rows = await ctx.supabase.from("entries").select(ENTRY_COLUMNS).eq("user_id", ctx.userId).ilike("title", pattern).order("updated_at", { ascending: false }).limit(limit).then(check);
  return (rows ?? []).map((row) => toEntry(row as EntryRow));
}
