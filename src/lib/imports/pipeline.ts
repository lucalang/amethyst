// Resumable franchise import state machine. Every step performs at most one
// provider request and idempotent writes, then the checkpoint is persisted, so
// a crashed or rate-limited job resumes exactly where it stopped.
import { z } from "zod";
import {
  categorizeType,
  isFollowRelation,
  needsEpisodeList,
  sectionFor,
  type Section,
  type WorkKind,
} from "./categorize.ts";
import type { JikanAnime, JikanCharacter, JikanClient, JikanEpisode } from "../providers/jikan.ts";
import { ProviderError, RateLimitedError } from "../providers/http.ts";

/** Persistent upstream failure (after bounded retries) that should not abort the whole import. */
function isSkippableProviderFailure(error: unknown): error is ProviderError {
  return error instanceof ProviderError && !(error instanceof RateLimitedError);
}

export const IMPORT_LIMITS = {
  maxWorks: 80,
  maxEpisodePagesPerWork: 40,
  maxCharacterWorks: 3,
};

export const importInputSchema = z.object({
  mal_id: z.number().int().positive(),
  entry_id: z.uuid().optional(),
  traverse: z.boolean().default(true),
});
export type ImportInput = z.infer<typeof importInputSchema>;

export type ImportWarning = { code: string; message: string; malId?: number };
export type Candidate = {
  malId: number;
  name: string;
  relation: string;
  fromMalId: number;
  reason: "linked" | "not_trackable" | "limit" | "unavailable";
};
export type WorkNode = {
  malId: number;
  title: string;
  kind: WorkKind;
  section: Section;
  relation: string | null;
  totalEpisodes: number | null;
  needsEpisodes: boolean;
  position: number;
  airedFrom: string | null;
};

export type ImportCheckpoint = {
  v: 1;
  phase: "discover" | "episodes" | "characters" | "finalize" | "done";
  entryId: string | null;
  queue: { malId: number; relation: string | null; fromMalId: number | null; name?: string }[];
  visited: number[];
  nodes: WorkNode[];
  candidates: Candidate[];
  truncated: boolean;
  episodeQueue: number[];
  episodeCursor: { malId: number; page: number; fetched: number } | null;
  characterQueue: number[];
  warnings: ImportWarning[];
  stats: { requests: number; episodes: number; characters: number; episodeLists: number };
};

export type ImportCoverage = {
  works: number;
  byKind: Record<WorkKind, number>;
  episodes: number;
  episodeLists: number;
  characters: number;
  truncated: boolean;
  requests: number;
  traversed: boolean;
};

export type ImportSummary = { coverage: ImportCoverage; warnings: ImportWarning[]; candidates: Candidate[] };

export interface ImportSink {
  begin(root: JikanAnime): Promise<string>;
  applyNode(entryId: string, node: WorkNode, anime: JikanAnime): Promise<void>;
  applyEpisodes(parentMalId: number, episodes: JikanEpisode[]): Promise<void>;
  saveCharacters(animeMalId: number, characters: JikanCharacter[]): Promise<void>;
  finish(entryId: string, summary: ImportSummary): Promise<void>;
}

/** Non-retryable import failure (e.g. the root anime does not exist). */
export class ImportFatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFatalError";
  }
}

export function initialCheckpoint(input: ImportInput): ImportCheckpoint {
  return {
    v: 1,
    phase: "discover",
    entryId: input.entry_id ?? null,
    queue: [{ malId: input.mal_id, relation: null, fromMalId: null }],
    visited: [],
    nodes: [],
    candidates: [],
    truncated: false,
    episodeQueue: [],
    episodeCursor: null,
    characterQueue: [],
    warnings: [],
    stats: { requests: 0, episodes: 0, characters: 0, episodeLists: 0 },
  };
}

export function isCheckpoint(value: unknown): value is ImportCheckpoint {
  return typeof value === "object" && value !== null && (value as { v?: unknown }).v === 1 && "phase" in value;
}

export function checkpointProgress(cp: ImportCheckpoint) {
  const labels: Record<ImportCheckpoint["phase"], string> = {
    discover: "Discovering related works",
    episodes: "Loading episode lists",
    characters: "Loading characters",
    finalize: "Finishing up",
    done: "Complete",
  };
  return {
    phase: cp.phase,
    message: labels[cp.phase],
    works: cp.nodes.length,
    queued: cp.queue.length,
    episodes: cp.stats.episodes,
    episodeListsRemaining: cp.episodeQueue.length + (cp.episodeCursor ? 1 : 0),
  };
}

function warn(cp: ImportCheckpoint, warning: ImportWarning) {
  if (!cp.warnings.some((existing) => existing.code === warning.code && existing.malId === warning.malId)) {
    cp.warnings.push(warning);
  }
}

function addCandidate(cp: ImportCheckpoint, candidate: Candidate) {
  if (!cp.candidates.some((existing) => existing.malId === candidate.malId)) cp.candidates.push(candidate);
}

type StepDeps = { jikan: JikanClient; sink: ImportSink; input: ImportInput };

async function discoverStep(cp: ImportCheckpoint, { jikan, sink, input }: StepDeps) {
  const next = cp.queue.shift();
  if (!next) {
    cp.phase = "episodes";
    cp.episodeQueue = cp.nodes.filter((node) => node.needsEpisodes).map((node) => node.malId);
    return;
  }
  if (cp.visited.includes(next.malId)) return; // cycle / duplicate edge

  const isRoot = next.malId === input.mal_id;
  let anime: JikanAnime | null;
  try {
    anime = await jikan.getAnime(next.malId);
  } catch (error) {
    if (isRoot || !isSkippableProviderFailure(error)) throw error;
    cp.stats.requests++;
    cp.visited.push(next.malId);
    const name = next.name ?? `Anime ${next.malId}`;
    warn(cp, {
      code: "provider_unavailable",
      malId: next.malId,
      message: `${name} could not be loaded from the provider right now (${error.status ?? "network"}). Refresh the franchise later or add it manually.`,
    });
    addCandidate(cp, { malId: next.malId, name, relation: next.relation ?? "Related", fromMalId: next.fromMalId ?? input.mal_id, reason: "unavailable" });
    return;
  }
  cp.stats.requests++;
  cp.visited.push(next.malId);

  if (!anime) {
    if (isRoot) throw new ImportFatalError(`MyAnimeList anime ${next.malId} was not found.`);
    warn(cp, { code: "missing_work", malId: next.malId, message: `Related entry ${next.malId} could not be loaded and was skipped.` });
    return;
  }

  const category = categorizeType(anime.type);
  if (!category.trackable && !isRoot) {
    addCandidate(cp, {
      malId: anime.mal_id,
      name: anime.title,
      relation: next.relation ?? "Related",
      fromMalId: next.fromMalId ?? anime.mal_id,
      reason: "not_trackable",
    });
    warn(cp, { code: "not_trackable", malId: anime.mal_id, message: `${anime.title} (${anime.type}) is not a trackable work and was not imported.` });
    return;
  }
  const kind: WorkKind = category.trackable ? category.kind : "special";
  if (!category.trackable || !category.typeKnown) {
    warn(cp, { code: "unknown_type", malId: anime.mal_id, message: `${anime.title}: the provider does not give a usable type; listed under OVAs & Specials.` });
  }

  if (!cp.entryId) cp.entryId = await sink.begin(anime);

  const relation = isRoot ? null : next.relation;
  const node: WorkNode = {
    malId: anime.mal_id,
    title: anime.title,
    kind,
    section: sectionFor(kind, relation),
    relation,
    totalEpisodes: anime.episodes ?? null,
    needsEpisodes: needsEpisodeList(kind, anime.episodes),
    position: cp.nodes.length,
    airedFrom: anime.aired?.from ?? null,
  };
  if (anime.episodes === null || anime.episodes === undefined) {
    warn(cp, { code: "unknown_total", malId: anime.mal_id, message: `${anime.title}: episode total is unknown (airing or not listed).` });
  }
  cp.nodes.push(node);
  await sink.applyNode(cp.entryId, node, anime);

  if (!input.traverse) return;
  for (const group of anime.relations ?? []) {
    for (const entry of group.entry) {
      if (entry.type !== "anime") continue;
      const known = cp.visited.includes(entry.mal_id) || cp.queue.some((queued) => queued.malId === entry.mal_id);
      if (isFollowRelation(group.relation)) {
        if (known) continue;
        if (cp.nodes.length + cp.queue.length >= IMPORT_LIMITS.maxWorks) {
          if (!cp.truncated) {
            warn(cp, { code: "work_limit", message: `Stopped following relations after ${IMPORT_LIMITS.maxWorks} works. Remaining works are listed as candidates.` });
          }
          cp.truncated = true;
          addCandidate(cp, { malId: entry.mal_id, name: entry.name ?? `Anime ${entry.mal_id}`, relation: group.relation, fromMalId: anime.mal_id, reason: "limit" });
          continue;
        }
        cp.queue.push({ malId: entry.mal_id, relation: group.relation, fromMalId: anime.mal_id, name: entry.name ?? undefined });
      } else if (!known) {
        // Crossovers, spin-offs and alternates are linked, never recursively imported.
        addCandidate(cp, {
          malId: entry.mal_id,
          name: entry.name ?? `Anime ${entry.mal_id}`,
          relation: group.relation || "Other",
          fromMalId: anime.mal_id,
          reason: "linked",
        });
      }
    }
  }
}

async function episodesStep(cp: ImportCheckpoint, { jikan, sink }: StepDeps) {
  if (!cp.episodeCursor) {
    const next = cp.episodeQueue.shift();
    if (next === undefined) {
      cp.phase = "characters";
      const main = cp.nodes.filter((node) => node.section === "main").map((node) => node.malId);
      cp.characterQueue = Array.from(new Set([cp.nodes[0]?.malId, ...main].filter((id): id is number => typeof id === "number"))).slice(
        0,
        IMPORT_LIMITS.maxCharacterWorks,
      );
      return;
    }
    cp.episodeCursor = { malId: next, page: 1, fetched: 0 };
  }

  const cursor = cp.episodeCursor;
  const node = cp.nodes.find((candidate) => candidate.malId === cursor.malId);
  let page: Awaited<ReturnType<JikanClient["getEpisodes"]>>;
  try {
    page = await jikan.getEpisodes(cursor.malId, cursor.page);
  } catch (error) {
    if (!isSkippableProviderFailure(error)) throw error;
    cp.stats.requests++;
    warn(cp, {
      code: "episodes_unavailable",
      malId: cursor.malId,
      message: `${node?.title ?? cursor.malId}: episode list could not be loaded after ${cursor.fetched} episodes (provider ${error.status ?? "network"} error). Refresh later.`,
    });
    cp.episodeCursor = null;
    return;
  }
  cp.stats.requests++;

  if (!page || (page.data.length === 0 && cursor.page === 1)) {
    warn(cp, {
      code: "no_episode_list",
      malId: cursor.malId,
      message: `${node?.title ?? cursor.malId}: the provider has no episode list; track it with a watched count instead.`,
    });
    cp.episodeCursor = null;
    return;
  }

  if (page.data.length > 0) await sink.applyEpisodes(cursor.malId, page.data);
  cursor.fetched += page.data.length;
  cp.stats.episodes += page.data.length;

  if (page.pagination.has_next_page) {
    if (cursor.page < IMPORT_LIMITS.maxEpisodePagesPerWork) {
      cursor.page++;
      return;
    }
    warn(cp, { code: "episode_limit", malId: cursor.malId, message: `${node?.title ?? cursor.malId}: episode list truncated after ${cursor.fetched} episodes.` });
  }

  cp.stats.episodeLists++;
  if (node?.totalEpisodes && cursor.fetched < node.totalEpisodes) {
    warn(cp, {
      code: "partial_episodes",
      malId: cursor.malId,
      message: `${node.title}: the provider lists ${cursor.fetched} of ${node.totalEpisodes} episodes. Missing episodes were not invented.`,
    });
  }
  cp.episodeCursor = null;
}

async function charactersStep(cp: ImportCheckpoint, { jikan, sink }: StepDeps) {
  const next = cp.characterQueue.shift();
  if (next === undefined) {
    cp.phase = "finalize";
    return;
  }
  let characters: JikanCharacter[] | null;
  try {
    characters = await jikan.getCharacters(next);
  } catch (error) {
    if (!isSkippableProviderFailure(error)) throw error;
    warn(cp, { code: "characters_unavailable", malId: next, message: `Characters could not be loaded right now for ${cp.nodes.find((n) => n.malId === next)?.title ?? next}.` });
    return;
  }
  cp.stats.requests++;
  if (!characters || characters.length === 0) {
    warn(cp, { code: "no_characters", malId: next, message: `No characters are listed for ${cp.nodes.find((n) => n.malId === next)?.title ?? next}.` });
    return;
  }
  await sink.saveCharacters(next, characters);
  cp.stats.characters += characters.length;
}

export function buildSummary(cp: ImportCheckpoint, traversed: boolean): ImportSummary {
  const byKind: Record<WorkKind, number> = { series: 0, movie: 0, ova: 0, ona: 0, special: 0 };
  for (const node of cp.nodes) byKind[node.kind]++;
  const nodeIds = new Set(cp.nodes.map((node) => node.malId));
  return {
    coverage: {
      works: cp.nodes.length,
      byKind,
      episodes: cp.stats.episodes,
      episodeLists: cp.stats.episodeLists,
      characters: cp.stats.characters,
      truncated: cp.truncated,
      requests: cp.stats.requests,
      traversed,
    },
    warnings: cp.warnings,
    candidates: cp.candidates.filter((candidate) => !nodeIds.has(candidate.malId)),
  };
}

/** Advance the import until done or `shouldYield()` asks to stop. */
export async function runImportSlice(
  cp: ImportCheckpoint,
  deps: StepDeps & { shouldYield: () => boolean; onCheckpoint: (cp: ImportCheckpoint) => Promise<void> },
): Promise<{ done: boolean }> {
  while (cp.phase !== "done") {
    if (deps.shouldYield()) return { done: false };
    switch (cp.phase) {
      case "discover":
        await discoverStep(cp, deps);
        break;
      case "episodes":
        await episodesStep(cp, deps);
        break;
      case "characters":
        await charactersStep(cp, deps);
        break;
      case "finalize":
        if (!cp.entryId) throw new ImportFatalError("Import finished without a target entry.");
        await deps.sink.finish(cp.entryId, buildSummary(cp, deps.input.traverse));
        cp.phase = "done";
        break;
    }
    if (cp.phase !== "done") await deps.onCheckpoint(cp);
  }
  return { done: true };
}
