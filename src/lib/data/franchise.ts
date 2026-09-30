import "server-only";
import type { AuthContext } from "@/lib/supabase/auth";
import type { Tables } from "@/lib/supabase/database.types";
import type { Episode, ProgressRow, Section, Work, WorkKind } from "@/lib/progress/derive";
import { fetchAll } from "./fetch-all";

export type Candidate = { malId: number; name: string; relation: string; fromMalId: number; reason: string };
export type Warning = { code: string; message: string; malId?: number };
export type Arc = {
  id: string;
  title: string;
  seriesItemId: string | null;
  startEpisode: number | null;
  endEpisode: number | null;
  position: number;
  memberIds: string[];
};
export type Character = { id: number; name: string; imageUrl: string | null; role: string | null; favorites: number };

export type FranchiseData = {
  entry: Tables<"entries">;
  works: Work[];
  episodes: Episode[];
  progress: ProgressRow[];
  arcs: Arc[];
  characters: Character[];
  candidates: Candidate[];
  warnings: Warning[];
  coverage: Record<string, unknown> | null;
  importStatus: string | null;
};

type Meta = Record<string, unknown>;
const str = (value: unknown) => (typeof value === "string" ? value : null);
const num = (value: unknown) => (typeof value === "number" ? value : null);

export async function loadFranchise(ctx: AuthContext, entryId: string): Promise<FranchiseData | null> {
  const { supabase } = ctx;
  const { data: entry } = await supabase.from("entries").select("*").eq("id", entryId).eq("kind", "franchise").maybeSingle();
  if (!entry) return null;

  const [links, episodeRows, progress, arcRows] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("entry_media_items")
        .select("section, relation, position, media_items(id, kind, title, mal_id, total_episodes, position, metadata)")
        .eq("entry_id", entryId)
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase.rpc("entry_episode_rows", { p_entry_id: entryId }).select("id, parent_id, title, episode_number, metadata").range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .rpc("entry_progress_rows", { p_entry_id: entryId })
        .select("media_item_id, is_checked, episodes_watched, episodes_mapped, status, score, version, updated_at")
        .range(from, to),
    ),
    supabase
      .from("arcs")
      .select("id, title, series_item_id, start_episode, end_episode, position, arc_items(media_item_id)")
      .eq("entry_id", entryId)
      .order("position"),
  ]);

  const works: Work[] = links.flatMap((link) => {
    const item = link.media_items;
    if (!item || item.kind === "episode" || item.kind === "checklist") return [];
    const meta = (item.metadata ?? {}) as Meta;
    return [
      {
        id: item.id,
        kind: item.kind as WorkKind,
        title: item.title,
        malId: item.mal_id,
        totalEpisodes: item.total_episodes,
        section: link.section as Section,
        relation: link.relation,
        position: link.position,
        airedFrom: str(meta.aired_from),
        imageUrl: str(meta.image_url),
        year: num(meta.year),
        providerType: str(meta.provider_type),
      },
    ];
  });

  const episodes: Episode[] = episodeRows.map((row) => {
    const meta = (row.metadata ?? {}) as Meta;
    return {
      id: row.id,
      parentId: row.parent_id!,
      number: row.episode_number,
      title: row.title,
      filler: meta.filler === true,
      recap: meta.recap === true,
      aired: str(meta.aired),
    };
  });

  const arcs: Arc[] = (arcRows.data ?? []).map((arc) => ({
    id: arc.id,
    title: arc.title,
    seriesItemId: arc.series_item_id,
    startEpisode: arc.start_episode,
    endEpisode: arc.end_episode,
    position: arc.position,
    memberIds: (arc.arc_items ?? []).map((member) => member.media_item_id),
  }));

  const characterSources = works
    .filter((work) => work.malId && (work.section === "main" || work.malId === (entry.metadata as Meta).root_mal_id))
    .map((work) => work.malId!) ;
  const characters: Character[] = [];
  if (characterSources.length > 0) {
    const { data } = await supabase
      .from("catalog_characters")
      .select("character_mal_id, name, image_url, role, favorites, position")
      .in("anime_mal_id", characterSources)
      .order("favorites", { ascending: false, nullsFirst: false })
      .limit(300);
    const seen = new Set<number>();
    for (const row of data ?? []) {
      if (seen.has(row.character_mal_id)) continue;
      seen.add(row.character_mal_id);
      characters.push({ id: row.character_mal_id, name: row.name, imageUrl: row.image_url, role: row.role, favorites: row.favorites ?? 0 });
    }
    characters.sort((a, b) => Number(b.role === "Main") - Number(a.role === "Main") || b.favorites - a.favorites);
  }

  const meta = (entry.metadata ?? {}) as Meta;
  return {
    entry,
    works,
    episodes,
    progress: progress as ProgressRow[],
    arcs,
    characters,
    candidates: Array.isArray(meta.candidates) ? (meta.candidates as Candidate[]) : [],
    warnings: Array.isArray(meta.warnings) ? (meta.warnings as Warning[]) : [],
    coverage: meta.coverage && typeof meta.coverage === "object" ? (meta.coverage as Record<string, unknown>) : null,
    importStatus: str(meta.import_status),
  };
}
