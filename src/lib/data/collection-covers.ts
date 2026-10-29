import "server-only";
import { collectionPath, entryPath } from "@/lib/collections";
import type { CoverShape } from "@/lib/cover-shape";
import { fanKey, type FanItem } from "@/lib/home-fan";
import type { AuthContext } from "@/lib/supabase/auth";
import type { HomePreview } from "./home";

/** Most covers a collection shows (Home cards, the Archive landing and the hub). */
export const MAX_COLLECTION_COVERS = 3;

type CoverRow = { id: string; collection_id: string; entry_id: string | null; image_url: string | null; image_shape: CoverShape };
type CoverEntry = { id: string; slug: string; title: string; cover_url: string | null; cover_shape: CoverShape };

const entryPreview = (entry: CoverEntry): HomePreview => ({
  id: entry.id,
  title: entry.title,
  coverUrl: entry.cover_url,
  coverShape: entry.cover_shape,
  href: entryPath(entry),
});

/** Automatic artwork: the most recently updated entries, those with covers first. */
export function automaticPreviews(entries: CoverEntry[]): HomePreview[] {
  return [...entries.filter((entry) => entry.cover_url), ...entries.filter((entry) => !entry.cover_url)].slice(0, MAX_COLLECTION_COVERS).map(entryPreview);
}

/** The covers the account chose, in order; null when it chose none (automatic artwork applies). */
export function chosenPreviews(
  rows: CoverRow[],
  entryById: Map<string, CoverEntry>,
  collection: { id: string; slug: string; name: string },
): HomePreview[] | null {
  const previews = rows.flatMap((row): HomePreview[] => {
    if (row.image_url) {
      return [{ id: row.id, title: collection.name, coverUrl: row.image_url, coverShape: row.image_shape, href: collectionPath(collection) }];
    }
    const entry = row.entry_id ? entryById.get(row.entry_id) : undefined;
    return entry ? [entryPreview(entry)] : [];
  });
  return previews.length ? previews.slice(0, MAX_COLLECTION_COVERS) : null;
}

export type CollectionCoverChoices = { items: FanItem[]; automatic: HomePreview[] };

/** What the cover picker needs for one collection: the saved choices and the automatic fallback. */
export async function loadCollectionCoverChoices(ctx: AuthContext, collectionId: string): Promise<CollectionCoverChoices | null> {
  const { supabase } = ctx;
  const recent = (covered: boolean) => {
    const query = supabase
      .from("entries")
      .select("id, slug, title, cover_url, cover_shape")
      .eq("collection_id", collectionId);
    return (covered ? query.not("cover_url", "is", null) : query.is("cover_url", null))
      .order("updated_at", { ascending: false })
      .order("id")
      .limit(MAX_COLLECTION_COVERS);
  };
  const [collection, rows, covered, uncovered] = await Promise.all([
    supabase.from("collections").select("id, name").eq("id", collectionId).maybeSingle(),
    supabase.from("collection_cover_items").select("id, entry_id, image_url, image_shape").eq("collection_id", collectionId).order("position"),
    recent(true),
    recent(false),
  ]);
  for (const result of [collection, rows, covered, uncovered]) {
    if (result.error) throw new Error(`Query failed (${result.error.code ?? "unknown"})`);
  }
  if (!collection.data) return null;
  const name = collection.data.name;

  const entryIds = (rows.data ?? []).flatMap((row) => (row.entry_id ? [row.entry_id] : []));
  const chosen = entryIds.length
    ? await supabase.from("entries").select("id, title, cover_url, cover_shape, frame").in("id", entryIds)
    : { data: [], error: null };
  if (chosen.error) throw new Error(`Query failed (${chosen.error.code ?? "unknown"})`);
  const chosenById = new Map((chosen.data ?? []).map((entry) => [entry.id, entry]));

  const items = (rows.data ?? []).flatMap((row): FanItem[] => {
    if (row.image_url) return [{ key: fanKey({ imageUrl: row.image_url }), kind: "image", url: row.image_url, shape: row.image_shape }];
    const entry = row.entry_id ? chosenById.get(row.entry_id) : undefined;
    if (!entry) return [];
    return [{
      key: fanKey({ entryId: entry.id }),
      kind: "entry",
      entryId: entry.id,
      title: entry.title,
      collectionName: name,
      coverUrl: entry.cover_url,
      coverShape: entry.cover_shape,
      frame: entry.frame,
    }];
  });
  return { items, automatic: automaticPreviews([...(covered.data ?? []), ...(uncovered.data ?? [])]) };
}
