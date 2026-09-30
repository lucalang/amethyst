import type { EntryKind } from "@/lib/validation/entries";

export type CollectionSlug = "anime" | "games" | "other";

export type Collection = {
  slug: CollectionSlug;
  kind: EntryKind;
  label: string;
  singular: string;
  newLabel: string;
  description: string;
};

export const COLLECTIONS: Record<CollectionSlug, Collection> = {
  anime: {
    slug: "anime",
    kind: "anime",
    label: "Anime",
    singular: "anime",
    newLabel: "New anime",
    description: "Series you watch, each with its own notes, arcs and checklists.",
  },
  games: {
    slug: "games",
    kind: "game",
    label: "Games",
    singular: "game",
    newLabel: "New game",
    description: "Games you play, with guides, codes, tier lists and goals.",
  },
  other: {
    slug: "other",
    kind: "custom",
    label: "Other",
    singular: "entry",
    newLabel: "New entry",
    description: "Everything that is neither anime nor a game.",
  },
};

export function isCollectionSlug(value: string): value is CollectionSlug {
  return Object.hasOwn(COLLECTIONS, value);
}

export function collectionForKind(kind: string): Collection {
  return Object.values(COLLECTIONS).find((collection) => collection.kind === kind) ?? COLLECTIONS.other;
}

export function entryPath(entry: { id: string; kind: string }): string {
  return `/${collectionForKind(entry.kind).slug}/${entry.id}`;
}

/** The collection a pathname belongs to, if any. */
export function collectionFromPath(pathname: string): Collection | null {
  const slug = pathname.split("/")[1] ?? "";
  return isCollectionSlug(slug) ? COLLECTIONS[slug] : null;
}
