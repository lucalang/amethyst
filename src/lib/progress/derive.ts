// Pure progress derivation shared by the franchise UI (optimistic updates) and
// tests. Mirrors the database rules in set_items_checked / derive_watch_status.

export type WatchStatus = "watching" | "completed" | "on_hold" | "dropped" | "plan_to_watch";
export type WorkKind = "series" | "movie" | "ova" | "ona" | "special";
export type Section = "main" | "movie" | "ova_special" | "related" | "checklist";

export type ProgressRow = {
  media_item_id: string;
  is_checked: boolean;
  episodes_watched: number;
  episodes_mapped: boolean;
  status: WatchStatus;
  score: number | null;
  version: number;
  updated_at: string;
};

export type ProgressMap = Record<string, ProgressRow>;

export type Work = {
  id: string;
  kind: WorkKind;
  title: string;
  malId: number | null;
  totalEpisodes: number | null;
  section: Section;
  relation: string | null;
  position: number;
  airedFrom: string | null;
  imageUrl: string | null;
  year: number | null;
  providerType: string | null;
};

export type Episode = {
  id: string;
  parentId: string;
  number: number | null;
  title: string;
  filler: boolean;
  recap: boolean;
  aired: string | null;
};

export function deriveStatus(current: WatchStatus, watched: number, total: number | null): WatchStatus {
  if (total !== null && total > 0 && watched >= total) return "completed";
  if (watched > 0) return current === "on_hold" || current === "dropped" ? current : "watching";
  return current === "watching" || current === "completed" ? "plan_to_watch" : current;
}

function emptyRow(id: string): ProgressRow {
  return {
    media_item_id: id,
    is_checked: false,
    episodes_watched: 0,
    episodes_mapped: true,
    status: "plan_to_watch",
    score: null,
    version: 0,
    updated_at: new Date(0).toISOString(),
  };
}

export function rowFor(progress: ProgressMap, id: string): ProgressRow {
  return progress[id] ?? emptyRow(id);
}

/** Optimistic equivalent of set_items_checked + recompute_container_progress. */
export function applyChecks(
  progress: ProgressMap,
  itemIds: string[],
  checked: boolean,
  episodesByParent: Map<string, Episode[]>,
  worksById: Map<string, Work>,
): ProgressMap {
  const next: ProgressMap = { ...progress };
  const parents = new Set<string>();
  const parentOf = new Map<string, string>();
  for (const [parentId, episodes] of episodesByParent) for (const episode of episodes) parentOf.set(episode.id, parentId);

  for (const id of new Set(itemIds)) {
    next[id] = { ...rowFor(next, id), is_checked: checked };
    const parent = parentOf.get(id);
    if (parent) parents.add(parent);
  }
  for (const parentId of parents) {
    const work = worksById.get(parentId);
    const episodes = episodesByParent.get(parentId) ?? [];
    const checkedCount = episodes.filter((episode) => rowFor(next, episode.id).is_checked).length;
    const previous = rowFor(next, parentId);
    const keepAggregate = !previous.episodes_mapped && checkedCount < previous.episodes_watched;
    const watched = keepAggregate ? previous.episodes_watched : checkedCount;
    next[parentId] = {
      ...previous,
      episodes_watched: watched,
      episodes_mapped: !keepAggregate,
      status: deriveStatus(previous.status, watched, work?.totalEpisodes ?? null),
    };
  }
  return next;
}

export type WorkProgress = {
  watched: number;
  total: number | null;
  listed: number;
  checkedEpisodes: number;
  complete: boolean;
  unmapped: boolean;
  status: WatchStatus;
  score: number | null;
};

export function workProgress(work: Work, progress: ProgressMap, episodes: Episode[]): WorkProgress {
  const row = rowFor(progress, work.id);
  const checkedEpisodes = episodes.filter((episode) => rowFor(progress, episode.id).is_checked).length;
  const total = work.totalEpisodes && work.totalEpisodes > 0 ? work.totalEpisodes : null;
  return {
    watched: row.episodes_watched,
    total,
    listed: episodes.length,
    checkedEpisodes,
    complete: row.status === "completed" || (total !== null && row.episodes_watched >= total),
    unmapped: episodes.length > 0 && !row.episodes_mapped && row.episodes_watched > checkedEpisodes,
    status: row.status,
    score: row.score,
  };
}

export type CountSummary = { done: number; total: number };
export type FranchiseSummary = {
  episodes: { watched: number; knownTotal: number; unknownTotals: number };
  series: CountSummary;
  movies: CountSummary;
  specials: CountSummary;
};

/** Franchise totals. Each work counts once, however many arcs reference its episodes. */
export function franchiseSummary(works: Work[], progress: ProgressMap, episodesByParent: Map<string, Episode[]>): FranchiseSummary {
  const summary: FranchiseSummary = {
    episodes: { watched: 0, knownTotal: 0, unknownTotals: 0 },
    series: { done: 0, total: 0 },
    movies: { done: 0, total: 0 },
    specials: { done: 0, total: 0 },
  };
  const seen = new Set<string>();
  for (const work of works) {
    if (seen.has(work.id)) continue;
    seen.add(work.id);
    const state = workProgress(work, progress, episodesByParent.get(work.id) ?? []);
    summary.episodes.watched += state.watched;
    if (state.total === null) summary.episodes.unknownTotals++;
    else summary.episodes.knownTotal += state.total;
    const bucket = work.section === "movie" ? summary.movies : work.section === "main" ? summary.series : summary.specials;
    bucket.total++;
    if (state.complete) bucket.done++;
  }
  return summary;
}

export type TriState = "checked" | "unchecked" | "indeterminate";

export function groupState(itemIds: string[], progress: ProgressMap): { checked: number; total: number; state: TriState } {
  const unique = Array.from(new Set(itemIds));
  const checked = unique.filter((id) => rowFor(progress, id).is_checked).length;
  const state: TriState = unique.length === 0 || checked === 0 ? "unchecked" : checked === unique.length ? "checked" : "indeterminate";
  return { checked, total: unique.length, state };
}

export function sortWorks(works: Work[]): Work[] {
  return [...works].sort((a, b) => {
    const left = a.airedFrom ? Date.parse(a.airedFrom) : Number.POSITIVE_INFINITY;
    const right = b.airedFrom ? Date.parse(b.airedFrom) : Number.POSITIVE_INFINITY;
    return left - right || a.position - b.position || a.title.localeCompare(b.title);
  });
}
