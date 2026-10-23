import { randomUUID } from "node:crypto";
import { z } from "zod";
import { loadTemplate, loadTemplates, storedStructure } from "@/lib/data/templates";
import { apiError, dbError, jsonResponse, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { cloneTemplateStructure } from "@/lib/templates";

type Params = { params: Promise<{ id: string }> };

function copyName(name: string, taken: Set<string>): string {
  for (let index = 1; index < 1000; index += 1) {
    const suffix = index === 1 ? " copy" : ` copy ${index}`;
    const candidate = `${name.slice(0, 80 - suffix.length).trimEnd()}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${name.slice(0, 60).trimEnd()} ${randomUUID().slice(0, 8)}`;
}

export async function POST(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "Template not found.");
  const [source, existing] = await Promise.all([loadTemplate(ctx, id), loadTemplates(ctx)]);
  if (!source) return apiError(404, "not_found", "Template not found.");

  const { data, error } = await ctx.supabase
    .from("workspace_templates")
    .insert({
      name: copyName(source.name, new Set(existing.map((template) => template.name.toLowerCase()))),
      structure: storedStructure(cloneTemplateStructure(source.structure, () => randomUUID())),
    })
    .select("id, name, updated_at")
    .single();
  if (error?.code === "23505") return apiError(409, "name_taken", "A template with the copy's name was just created. Try again.");
  if (error) return dbError(error);
  return jsonResponse({ template: { id: data.id, name: data.name, updatedAt: data.updated_at } }, { status: 201 });
}
