import { z } from "zod";
import { NODE_COLUMNS, loadNodeDetail, nodeWriteError, toWorkspaceNode } from "@/lib/data/workspace";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { updateNodeSchema } from "@/lib/validation/workspace";
import { markdownTaskCounts } from "@/lib/progress/markdown";

type Params = { params: Promise<{ id: string }> };

const notFound = () => apiError(404, "not_found", "File or folder not found.");

export async function GET(_request: Request, { params }: Params) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const detail = await loadNodeDetail(ctx.supabase, id);
  return detail ? jsonResponse(detail) : notFound();
}

export async function PATCH(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();

  const parsed = await parseJson(request, updateNodeSchema);
  if ("response" in parsed) return parsed.response;
  const { name, parentId, content, expectedVersion, includeInCoverProgress } = parsed.data;
  let progressCounts = content !== undefined ? markdownTaskCounts(content) : undefined;
  let version = expectedVersion;
  if (includeInCoverProgress !== undefined) {
    const { data: current, error } = await ctx.supabase.from("workspace_nodes").select("kind, content, version").eq("id", id).maybeSingle();
    if (error) return dbError(error);
    if (!current) return notFound();
    if (current.kind === "folder") return apiError(422, "rejected", "Only files contribute to cover progress.");
    if (current.kind === "note") progressCounts = markdownTaskCounts(content ?? current.content);
    version ??= current.version;
  }

  let query = ctx.supabase
    .from("workspace_nodes")
    .update({
      ...(name !== undefined ? { name } : {}),
      ...(parentId !== undefined ? { parent_id: parentId } : {}),
      ...(content !== undefined ? { content } : {}),
      ...(includeInCoverProgress !== undefined ? { include_in_cover_progress: includeInCoverProgress } : {}),
      ...(progressCounts ? { markdown_tasks_total: progressCounts.total, markdown_tasks_checked: progressCounts.checked } : {}),
    })
    .eq("id", id);
  if (version !== undefined) query = query.eq("version", version);
  const { data, error } = await query.select(NODE_COLUMNS).maybeSingle();
  if (error) {
    if (error.code === "23514" && content !== undefined) return apiError(422, "rejected", "Only notes have text content.");
    return nodeWriteError(error, name);
  }
  if (!data) {
    const { data: exists } = await ctx.supabase.from("workspace_nodes").select("id").eq("id", id).maybeSingle();
    return exists
      ? apiError(409, "version_conflict", "This file was changed somewhere else (another tab or device).")
      : notFound();
  }
  if (data.kind === "checklist" && includeInCoverProgress !== undefined) {
    const { data: counts, error } = await ctx.supabase.from("workspace_tree").select("items_total, items_checked").eq("id", id).single();
    if (error) return dbError(error);
    return jsonResponse({ node: toWorkspaceNode(data, { total: counts.items_total ?? 0, checked: counts.items_checked ?? 0 }) });
  }
  return jsonResponse({ node: toWorkspaceNode(data) });
}

export async function DELETE(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();

  const { data, error } = await ctx.supabase.from("workspace_nodes").delete().eq("id", id).select("id").maybeSingle();
  if (error) return dbError(error);
  return data ? jsonResponse({ deleted: true }) : notFound();
}
