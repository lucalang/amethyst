import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { EntryWorkspace } from "@/components/workspace/workspace";
import { COLLECTIONS, collectionForKind, entryPath, isCollectionSlug } from "@/lib/collections";
import { loadNodeDetail, loadWorkspace } from "@/lib/data/workspace";
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
  if (!isCollectionSlug(collection) || !z.uuid().safeParse(id).success) notFound();
  const ctx = await requireUser();
  const data = await loadWorkspace(ctx, id);
  if (!data) notFound();
  // An entry always lives in its own collection's URL space.
  if (collectionForKind(data.entry.kind).slug !== collection) {
    redirect(`${entryPath(data.entry)}${typeof file === "string" ? `?file=${encodeURIComponent(file)}` : ""}`);
  }

  const requested = typeof file === "string" ? data.nodes.find((node) => node.id === file && node.kind !== "folder") : undefined;
  const initialId = requested?.id ?? firstFile(buildTree(data.nodes))?.id ?? null;
  const initialFile = initialId ? await loadNodeDetail(ctx.supabase, initialId, id) : null;

  return (
    <EntryWorkspace
      key={data.entry.id}
      collection={COLLECTIONS[collection]}
      entry={data.entry}
      initialNodes={data.nodes}
      initialFile={initialFile}
    />
  );
}
