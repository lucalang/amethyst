// Categorization strictly from provider metadata (type + relation), never titles.

export type WorkKind = "series" | "movie" | "ova" | "ona" | "special";
export type Section = "main" | "movie" | "ova_special";

/** Relations traversed as part of the same franchise (compared case-insensitively). */
export const FOLLOW_RELATIONS = new Set(["sequel", "prequel", "parent story", "side story", "full story", "summary"]);
/** Relations recorded as linked candidates (crossovers, alternates) but never traversed. */
export const CANDIDATE_RELATIONS = new Set(["alternative version", "alternative setting", "spin-off", "character", "other"]);

export function normalizeRelation(relation: string | null | undefined): string {
  return (relation ?? "").trim().toLowerCase();
}

export function isFollowRelation(relation: string | null | undefined): boolean {
  return FOLLOW_RELATIONS.has(normalizeRelation(relation));
}

const TYPE_TO_KIND: Record<string, WorkKind> = {
  TV: "series",
  Movie: "movie",
  OVA: "ova",
  ONA: "ona",
  Special: "special",
  "TV Special": "special",
};

/** Promotional or music entries are not trackable works. */
const NON_WORK_TYPES = new Set(["Music", "CM", "PV"]);

export type Categorized =
  | { trackable: true; kind: WorkKind; typeKnown: boolean }
  | { trackable: false; reason: "non_work_type" };

export function categorizeType(type: string | null | undefined): Categorized {
  if (type && NON_WORK_TYPES.has(type)) return { trackable: false, reason: "non_work_type" };
  const kind = type ? TYPE_TO_KIND[type] : undefined;
  if (kind) return { trackable: true, kind, typeKnown: true };
  return { trackable: true, kind: "special", typeKnown: false };
}

export function sectionFor(kind: WorkKind, relation: string | null): Section {
  switch (kind) {
    case "series":
      return "main";
    case "movie":
      return "movie";
    case "ona": {
      // Web series continuing the main story (root, sequel or prequel) are main series.
      const normalized = normalizeRelation(relation);
      return relation === null || normalized === "sequel" || normalized === "prequel" ? "main" : "ova_special";
    }
    default:
      return "ova_special";
  }
}

/** Multi-episode works get an episode checklist; single-episode works are checked directly. */
export function needsEpisodeList(kind: WorkKind, episodes: number | null | undefined): boolean {
  if (kind === "movie") return false;
  return episodes === null || episodes === undefined || episodes > 1;
}
