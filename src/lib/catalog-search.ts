/**
 * Local search for browsable catalogs (themes, frames, decorations, games, achievements, shops).
 * Matching is case- and accent-insensitive; every word of the query must appear in the item's
 * name or its category/tag text. It always runs over the whole catalog in memory, so it
 * combines freely with category and ownership filters.
 */

export type Ownership = "all" | "owned" | "unowned";

export const OWNERSHIP_LABELS: Record<Ownership, string> = { all: "All", owned: "Owned", unowned: "Not owned" };

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("en");

/** A predicate over an item's searchable fields, or null when the query is blank (everything matches). */
export function catalogMatcher(query: string): ((...fields: (string | null | undefined)[]) => boolean) | null {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  return (...fields) => {
    const haystack = fold(fields.filter(Boolean).join(" \n "));
    return words.every((word) => haystack.includes(word));
  };
}

export const ownershipMatches = (filter: Ownership, owned: boolean) => filter === "all" || (filter === "owned") === owned;

/** Compact pickers only show a search box once their catalog grows past this many options. */
export const PICKER_SEARCH_MIN = 9;
