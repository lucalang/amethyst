import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { EntryWorkspace } from "@/components/workspace/workspace";
import { entryPath } from "@/lib/collections";
import { loadCategories, loadEntryCategoryIds } from "@/lib/data/categories";
import { loadCollection, loadCollections, resolveEntry } from "@/lib/data/collections";
import { loadNodeDetail, loadWorkspace } from "@/lib/data/workspace";
import { SLIM_BASE } from "@/lib/edition";
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

/** The entry's real workspace (notes, checklists, files, header and its Workspace Theme), in the Slim shell. */
export default async function SlimEntryPage({ params, searchParams }: Props) {
  const [{ entry: param }, { file }] = await Promise.all([params, searchParams]);
  const ctx = await requireUser();
  const entry = await resolveEntry(ctx, param);
  if (!entry) notFound();
  if (param !== entry.slug) {
    redirect(`${SLIM_BASE}${entryPath(entry)}${typeof file === "string" ? `?file=${encodeURIComponent(file)}` : ""}`);
  }
  const id = entry.id;
  const linked = typeof file === "string" && /^[0-9a-f-]{36}$/i.test(file) ? file : null;
  const [data, [collection, collections, categories, categoryIds, pin], linkedFile] = await Promise.all([
    loadWorkspace(ctx, id),
    Promise.all([
      loadCollection(ctx, entry.collection_id),
      loadCollections(ctx),
      loadCategories(ctx, entry.collection_id),
      loadEntryCategoryIds(ctx, id),
      ctx.supabase.from("entry_pins").select("entry_id").eq("entry_id", id).maybeSingle(),
    ]),
    linked ? loadNodeDetail(ctx.supabase, linked, id).catch(() => null) : null,
  ]);
  if (!data || !collection) notFound();
  const requested = linked ? data.nodes.find((node) => node.id === linked && node.kind !== "folder") : undefined;
  const initialId = requested?.id ?? firstFile(buildTree(data.nodes))?.id ?? null;
  const initialFile = requested && linkedFile ? linkedFile : initialId ? await loadNodeDetail(ctx.supabase, initialId, id) : null;

  return (
    <EntryWorkspace
      key={data.entry.id}
      collection={collection}
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
