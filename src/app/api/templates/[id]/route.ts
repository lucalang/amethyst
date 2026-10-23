import { z } from "zod";
import { loadTemplate, storedStructure } from "@/lib/data/templates";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { readTemplateStructure, templatePatchSchema } from "@/lib/templates";

type Params = { params: Promise<{ id: string }> };

const notFound = () => apiError(404, "not_found", "Template not found.");

export async function GET(_request: Request, { params }: Params) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const template = await loadTemplate(ctx, id);
  return template ? jsonResponse({ template }) : notFound();
}

export async function PATCH(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const parsed = await parseJson(request, templatePatchSchema);
  if ("response" in parsed) return parsed.response;
  const { name, structure } = parsed.data;
  const { data, error } = await ctx.supabase
    .from("workspace_templates")
    .update({ ...(name !== undefined ? { name } : {}), ...(structure !== undefined ? { structure: storedStructure(structure) } : {}) })
    .eq("id", id)
    .select("id, name, updated_at, structure")
    .maybeSingle();
  if (error?.code === "23505") return apiError(409, "name_taken", "You already have a template with that name.");
  if (error?.code === "23514") return apiError(422, "rejected", "This template is too large to save. Shorten some notes or remove files.");
  if (error) return dbError(error);
  if (!data) return notFound();
  return jsonResponse({ template: { id: data.id, name: data.name, updatedAt: data.updated_at, structure: readTemplateStructure(data.structure) } });
}

/** Deleting a template never touches entries created from it (they hold independent copies). */
export async function DELETE(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const { data, error } = await ctx.supabase.from("workspace_templates").delete().eq("id", id).select("id").maybeSingle();
  if (error) return dbError(error);
  return data ? jsonResponse({ deleted: true }) : notFound();
}
