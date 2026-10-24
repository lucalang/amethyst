import { z } from "zod";
import { NODE_COLUMNS, loadWorkspaceNodes, nodeWriteError, toWorkspaceNode } from "@/lib/data/workspace";
import { apiError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { refreshArchiveAchievements } from "@/lib/data/achievements";
import { createNodeSchema } from "@/lib/validation/workspace";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "Entry not found.");
  const { data: entry } = await ctx.supabase.from("entries").select("id").eq("id", id).maybeSingle();
  if (!entry) return apiError(404, "not_found", "Entry not found.");
  return jsonResponse({ nodes: await loadWorkspaceNodes(ctx.supabase, id) });
}

export async function POST(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "Entry not found.");

  const parsed = await parseJson(request, createNodeSchema);
  if ("response" in parsed) return parsed.response;
  const { parentId, kind, name, includeInCoverProgress } = parsed.data;

  const { data, error } = await ctx.supabase
    .from("workspace_nodes")
    .insert({ entry_id: id, parent_id: parentId, kind, name, include_in_cover_progress: includeInCoverProgress ?? kind === "checklist" })
    .select(NODE_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23503" && !parentId) return apiError(404, "not_found", "Entry not found.");
    return nodeWriteError(error, name);
  }
  const achievementUnlocks = kind === "note" ? await refreshArchiveAchievements(ctx) : [];
  return jsonResponse({ node: toWorkspaceNode(data), achievementUnlocks }, { status: 201 });
}
