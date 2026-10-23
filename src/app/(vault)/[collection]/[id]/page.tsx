import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { EntryWorkspace } from "@/components/workspace/workspace";
import { entryPath } from "@/lib/collections";
import { loadCollection, loadCollections } from "@/lib/data/collections";
import { loadNodeDetail, loadWorkspace } from "@/lib/data/workspace";
import { loadCategories, loadEntryCategoryIds } from "@/lib/data/categories";
import { getAuthContext, requireUser } from "@/lib/supabase/auth";
import { buildTree, firstFile } from "@/lib/workspace/tree";

type Props = {
  params: Promise<{ collection: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx || !z.uuid().safeParse(id).success) return { title: "Workspace" };
  const { data } = await ctx.supabase.from("entries").select("title").eq("id", id).maybeSingle();
  return { title: data?.title ?? "Not found" };
}

export default async function EntryPage({ params, searchParams }: Props) {
  const [{ collection, id }, { file }] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireUser();
  const data = await loadWorkspace(ctx, id);
  if (!data) notFound();
  // An entry always lives in its own collection's URL space.
  if (data.entry.collection_id !== collection) {
    redirect(`${entryPath(data.entry)}${typeof file === "string" ? `?file=${encodeURIComponent(file)}` : ""}`);
  }

  const requested = typeof file === "string" ? data.nodes.find((node) => node.id === file && node.kind !== "folder") : undefined;
  const initialId = requested?.id ?? firstFile(buildTree(data.nodes))?.id ?? null;
  const initialFile = initialId ? await loadNodeDetail(ctx.supabase, initialId, id) : null;
  const [currentCollection, collections, categories, categoryIds, pin] = await Promise.all([
    loadCollection(ctx, data.entry.collection_id), loadCollections(ctx), loadCategories(ctx, data.entry.collection_id), loadEntryCategoryIds(ctx, id),
    ctx.supabase.from("entry_pins").select("entry_id").eq("entry_id", id).maybeSingle(),
  ]);
  if (!currentCollection) notFound();

  return (
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
  );
}
