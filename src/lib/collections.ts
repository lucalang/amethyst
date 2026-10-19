export type LibraryCategory = { id: string; name: string };

export function isLegacyCollection(value: string): boolean {
  return ["anime", "games", "other"].includes(value);
}

export function entryPath(entry: { id: string; collection_id?: string; kind?: string }): string {
  return entry.collection_id ? `/${entry.collection_id}/${entry.id}` : `/entries/${entry.id}`;
}
