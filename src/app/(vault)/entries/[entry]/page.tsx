import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { EntryCollectionMarker } from "@/components/layout/current-collection";
import { EntryWorkspace } from "@/components/workspace/workspace";
import { entryPath } from "@/lib/collections";
import { loadCollection, loadCollections, resolveEntry } from "@/lib/data/collections";
import { loadNodeDetail, loadWorkspace } from "@/lib/data/workspace";
import { loadCategories, loadEntryCategoryIds } from "@/lib/data/categories";
import { measureServer } from "@/lib/data/timing";
import { getAuthContext, requireUser } from "@/lib/supabase/auth";
import { buildTree, firstFile } from "@/lib/workspace/tree";

type Props = {
  params: Promise<{ entry: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { entry: param } = await params;
  const ctx = await getAuthContext();
  if (!ctx) return { title: "Workspace" };
  const entry = await resolveEntry(ctx, param);
  if (!entry) return { title: "Not found" };
  const { data } = await ctx.supabase.from("entries").select("title").eq("id", entry.id).maybeSingle();
  return { title: data?.title ?? "Not found" };
}

export default async function EntryPage({ params, searchParams }: Props) {
  const [{ entry: param }, { file }] = await Promise.all([params, searchParams]);
  const ctx = await measureServer("entry.auth", requireUser);
  const entry = await resolveEntry(ctx, param);
  if (!entry) notFound();
  // Ids and slugs from before a rename land on the current readable address.
  if (param !== entry.slug) {
    redirect(`${entryPath(entry)}${typeof file === "string" ? `?file=${encodeURIComponent(file)}` : ""}`);
  }
  const id = entry.id;
  // Controls only need the resolved entry, and a linked file can be read speculatively, so both overlap the tree read.
  const linked = typeof file === "string" && /^[0-9a-f-]{36}$/i.test(file) ? file : null;
  const [data, [currentCollection, collections, categories, categoryIds, pin], linkedFile] = await measureServer("entry.workspace-and-controls", () => Promise.all([
    loadWorkspace(ctx, id),
    Promise.all([
      loadCollection(ctx, entry.collection_id), loadCollections(ctx), loadCategories(ctx, entry.collection_id), loadEntryCategoryIds(ctx, id),
      ctx.supabase.from("entry_pins").select("entry_id").eq("entry_id", id).maybeSingle(),
    ]),
    linked ? loadNodeDetail(ctx.supabase, linked, id).catch(() => null) : null,
  ]));
  if (!data || !currentCollection) notFound();

  const requested = linked ? data.nodes.find((node) => node.id === linked && node.kind !== "folder") : undefined;
  const initialId = requested?.id ?? firstFile(buildTree(data.nodes))?.id ?? null;
  const initialFile = requested && linkedFile ? linkedFile : initialId ? await measureServer("entry.detail", () => loadNodeDetail(ctx.supabase, initialId, id)) : null;

  return (
    <>
    <EntryCollectionMarker id={currentCollection.id} />
    <EntryWorkspace
      key={data.entry.id}
      collection={currentCollection}
      collections={collections}
      entry={data.entry}
      categories={categories}
      categoryIds={categoryIds}
      pinned={Boolean(pin.data)}
      initialNodes={data.nodes}
      initialFile={initialFile}
    />
    </>
  );
}
