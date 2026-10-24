/**
 * How a collection's entries are laid out. Saved per collection (collections.layout); any
 * id the app doesn't know (or no longer ships) falls back to the gallery. New layouts only
 * need an entry here and a renderer in LibraryResults.
 */
export const COLLECTION_LAYOUT_IDS = ["gallery", "list", "table"] as const;
export type CollectionLayout = (typeof COLLECTION_LAYOUT_IDS)[number];
export const DEFAULT_COLLECTION_LAYOUT: CollectionLayout = "gallery";

export const COLLECTION_LAYOUTS: Record<CollectionLayout, { name: string; description: string }> = {
  gallery: { name: "Cover gallery", description: "Artwork cards in a grid" },
  list: { name: "Compact list", description: "Small covers with aligned details" },
  table: { name: "Information table", description: "Columns for labels, progress and dates" },
};

export function isCollectionLayout(value: unknown): value is CollectionLayout {
  return typeof value === "string" && (COLLECTION_LAYOUT_IDS as readonly string[]).includes(value);
}

export function readCollectionLayout(value: unknown): CollectionLayout {
  return isCollectionLayout(value) ? value : DEFAULT_COLLECTION_LAYOUT;
}
