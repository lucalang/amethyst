import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { EntryWorkspace } from "@/components/workspace/workspace";
import { loadNodeDetail, loadWorkspace } from "@/lib/data/workspace";
import { allowedImageHosts } from "@/lib/env";
import { requireUser } from "@/lib/supabase/auth";
import { buildTree, firstFile } from "@/lib/workspace/tree";

export const metadata: Metadata = { title: "Workspace" };

export default async function EntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, { file }] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireUser();
  const data = await loadWorkspace(ctx, id);
  if (!data) notFound();

  const requested = typeof file === "string" ? data.nodes.find((node) => node.id === file && node.kind !== "folder") : undefined;
  const initialId = requested?.id ?? firstFile(buildTree(data.nodes))?.id ?? null;
  const initialFile = initialId ? await loadNodeDetail(ctx.supabase, initialId, id) : null;

  return (
    <EntryWorkspace key={data.entry.id} entry={data.entry} initialNodes={data.nodes} initialFile={initialFile} imageHosts={allowedImageHosts()} />
  );
}
