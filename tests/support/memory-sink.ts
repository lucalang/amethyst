import type { ImportSink, ImportSummary, WorkNode } from "@/lib/imports/pipeline";

/** In-memory ImportSink mirroring the idempotent upsert semantics of the database. */
export function createMemorySink() {
  const entries = new Map<string, { rootMalId: number; title: string }>();
  const works = new Map<number, WorkNode>();
  const links = new Map<string, Set<number>>();
  const episodes = new Map<string, { parent: number; number: number; title: string }>();
  const characters = new Map<number, number>();
  let summary: ImportSummary | null = null;
  const calls = { begin: 0, applyNode: 0, applyEpisodes: 0, finish: 0 };

  const sink: ImportSink = {
    async begin(root) {
      calls.begin++;
      const existing = [...entries.entries()].find(([, entry]) => entry.rootMalId === root.mal_id);
      if (existing) return existing[0];
      const id = `entry-${entries.size + 1}`;
      entries.set(id, { rootMalId: root.mal_id, title: root.title });
      return id;
    },
    async applyNode(entryId, node) {
      calls.applyNode++;
      works.set(node.malId, node);
      links.set(entryId, new Set([...(links.get(entryId) ?? []), node.malId]));
    },
    async applyEpisodes(parent, list) {
      calls.applyEpisodes++;
      for (const episode of list) {
        episodes.set(`mal:${parent}:episode:${episode.mal_id}`, { parent, number: episode.mal_id, title: episode.title ?? `Episode ${episode.mal_id}` });
      }
    },
    async saveCharacters(animeMalId, list) {
      characters.set(animeMalId, list.length);
    },
    async finish(_entryId, value) {
      calls.finish++;
      summary = value;
    },
  };

  return {
    sink,
    entries,
    works,
    links,
    episodes,
    characters,
    calls,
    get summary() {
      return summary;
    },
    episodesOf: (parent: number) => [...episodes.values()].filter((episode) => episode.parent === parent),
  };
}
