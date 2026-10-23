import "server-only";
import { entryPath } from "@/lib/collections";
import type { CoverShape } from "@/lib/cover-shape";
import { EMPTY_SUMMARY, type LibraryEntry } from "@/lib/progress/library";
import type { AuthContext } from "@/lib/supabase/auth";
import { loadCollections } from "./collections";
import { fetchAll } from "./fetch-all";

/** One "continue" entry plus up to six recently opened ones. */
const VISIT_LIMIT = 7;
const PIN_LIMIT = 48;
const TASK_LIMIT = 8;
const PREVIEW_LIMIT = 3;
const SHOWCASE_LIMIT = 5;

export type HomePreview = { id: string; title: string; coverUrl: string | null; coverShape: CoverShape; href: string };
export type HomeCollection = { id: string; name: string; description: string; entryCount: number; previews: HomePreview[] };
export type HomeTask = { id: string; label: string; dueDate: string; starred: boolean; href: string; entryTitle: string; fileName: string };
export type HomeContinue = {
  entry: LibraryEntry;
  collectionName: string;
  bannerUrl: string | null;
  file: { name: string; kind: string } | null;
  href: string;
};
export type HomeData = {
  displayName: string;
  collections: HomeCollection[];
  counts: { collections: number; entries: number; files: number };
  continueEntry: HomeContinue | null;
  recent: LibraryEntry[];
  pinned: LibraryEntry[];
  tasks: HomeTask[];
  /** Artwork from the user's own archive for the welcome area, most relevant first. */
  showcase: HomePreview[];
};

function check<T>(result: { data: T; error: { code?: string } | null }): T {
  if (result.error) throw new Error(`Query failed (${result.error.code ?? "unknown"})`);
  return result.data;
}

/** Everything the Home dashboard shows, scoped to the signed-in user by RLS. */
export async function loadHome(ctx: AuthContext): Promise<HomeData> {
  const { supabase } = ctx;
  const [collections, entries, visits, pins, files, tasks, profile] = await Promise.all([
    loadCollections(ctx),
    fetchAll(
      (from, to) =>
        supabase
          .from("entries")
          .select("id, collection_id, kind, title, cover_url, cover_shape, banner_url, created_at, updated_at")
          .order("updated_at", { ascending: false })
          .order("id")
          .range(from, to),
      200_000,
    ),
    supabase.from("entry_visits").select("entry_id, last_file_id, visited_at").order("visited_at", { ascending: false }).limit(VISIT_LIMIT).then(check),
    supabase.from("entry_pins").select("entry_id, pinned_at").order("pinned_at", { ascending: false }).limit(PIN_LIMIT).then(check),
    supabase.from("workspace_nodes").select("id", { count: "exact", head: true }).neq("kind", "folder"),
    supabase
      .from("workspace_checklist_items")
      .select("id, file_id, label, due_date, starred")
      .eq("checked", false)
      .not("due_date", "is", null)
      .order("due_date")
      .order("position")
      .order("id")
      .limit(TASK_LIMIT)
      .then(check),
    supabase.from("users").select("display_name").eq("id", ctx.userId).maybeSingle().then(check),
  ]);
  if (files.error) throw new Error(`Query failed (${files.error.code ?? "unknown"})`);

  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const visitRows = (visits ?? []).filter((visit) => entryById.has(visit.entry_id));
  const pinRows = (pins ?? []).filter((pin) => entryById.has(pin.entry_id));
  const pinnedIds = new Set(pinRows.map((pin) => pin.entry_id));
  const last = visitRows[0];
  const fileIds = [...new Set([...(tasks ?? []).map((task) => task.file_id), ...(last?.last_file_id ? [last.last_file_id] : [])])];
  const shownIds = [...new Set([...visitRows.map((visit) => visit.entry_id), ...pinRows.map((pin) => pin.entry_id)])];

  const [summaries, nodes] = await Promise.all([
    shownIds.length ? supabase.from("entry_workspace_summary").select("*").in("entry_id", shownIds).then(check) : [],
    fileIds.length ? supabase.from("workspace_nodes").select("id, entry_id, name, kind").in("id", fileIds).then(check) : [],
  ]);
  const summaryById = new Map((summaries ?? []).map((row) => [row.entry_id, row]));
  const nodeById = new Map((nodes ?? []).map((node) => [node.id, node]));

  const toLibraryEntry = (id: string): LibraryEntry => {
    const entry = entryById.get(id)!;
    const row = summaryById.get(id);
    return {
      id: entry.id,
      collection_id: entry.collection_id,
      kind: entry.kind as LibraryEntry["kind"],
      title: entry.title,
      coverUrl: entry.cover_url,
      coverShape: entry.cover_shape,
      categoryIds: [],
      createdAt: entry.created_at,
      lastActivityAt: row?.last_activity_at ?? entry.updated_at,
      summary: row
        ? { filesTotal: row.files_total ?? 0, checklistTotal: row.checklist_total ?? 0, checklistChecked: row.checklist_checked ?? 0 }
        : EMPTY_SUMMARY,
      pinned: pinnedIds.has(id),
    };
  };

  const collectionNames = new Map(collections.map((collection) => [collection.id, collection.name]));
  let continueEntry: HomeContinue | null = null;
  if (last) {
    const entry = toLibraryEntry(last.entry_id);
    const node = last.last_file_id ? nodeById.get(last.last_file_id) : undefined;
    const file = node && node.entry_id === entry.id && node.kind !== "folder" ? node : null;
    continueEntry = {
      entry,
      collectionName: collectionNames.get(entryById.get(entry.id)!.collection_id) ?? "",
      bannerUrl: entryById.get(entry.id)!.banner_url,
      file: file ? { name: file.name, kind: file.kind } : null,
      href: file ? `${entryPath(entry)}?file=${file.id}` : entryPath(entry),
    };
  }

  const byCollection = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = byCollection.get(entry.collection_id);
    if (list) list.push(entry);
    else byCollection.set(entry.collection_id, [entry]);
  }

  const preview = (entry: (typeof entries)[number]): HomePreview => ({
    id: entry.id,
    title: entry.title,
    coverUrl: entry.cover_url,
    coverShape: entry.cover_shape,
    href: entryPath(entry),
  });

  // Continue first, then pinned and recently opened, then the most recently updated, all with artwork.
  const showcaseIds = new Set<string>();
  for (const id of [...visitRows.map((visit) => visit.entry_id).slice(0, 1), ...pinRows.map((pin) => pin.entry_id), ...visitRows.map((visit) => visit.entry_id), ...entries.map((entry) => entry.id)]) {
    if (showcaseIds.size >= SHOWCASE_LIMIT) break;
    if (entryById.get(id)?.cover_url) showcaseIds.add(id);
  }

  return {
    displayName: profile?.display_name?.trim() || ctx.email?.split("@")[0] || "",
    showcase: [...showcaseIds].map((id) => preview(entryById.get(id)!)),
    collections: collections.map((collection) => {
      const list = byCollection.get(collection.id) ?? [];
      const previews = [...list.filter((entry) => entry.cover_url), ...list.filter((entry) => !entry.cover_url)].slice(0, PREVIEW_LIMIT);
      return {
        id: collection.id,
        name: collection.name,
        description: collection.description,
        entryCount: list.length,
        previews: previews.map(preview),
      };
    }),
    counts: { collections: collections.length, entries: entries.length, files: files.count ?? 0 },
    continueEntry,
    recent: visitRows.slice(1).map((visit) => toLibraryEntry(visit.entry_id)),
    pinned: pinRows.map((pin) => toLibraryEntry(pin.entry_id)),
    tasks: (tasks ?? []).flatMap((task) => {
      const node = nodeById.get(task.file_id);
      const entry = node ? entryById.get(node.entry_id) : undefined;
      if (!node || !entry || !task.due_date) return [];
      return [{
        id: task.id,
        label: task.label,
        dueDate: task.due_date,
        starred: task.starred,
        href: `${entryPath(entry)}?file=${node.id}`,
        entryTitle: entry.title,
        fileName: node.name,
      }];
    }),
  };
}
