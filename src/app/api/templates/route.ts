import { loadTemplates, storedStructure } from "@/lib/data/templates";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { templateInputSchema } from "@/lib/templates";

export async function GET() {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  try {
    return jsonResponse({ templates: await loadTemplates(ctx) });
  } catch {
    return apiError(500, "server_error", "Could not load templates.");
  }
}

export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, templateInputSchema);
  if ("response" in parsed) return parsed.response;
  const { data, error } = await ctx.supabase
    .from("workspace_templates")
    .insert({ name: parsed.data.name, structure: storedStructure(parsed.data.structure ?? { nodes: [] }) })
    .select("id, name, updated_at")
    .single();
  if (error?.code === "23505") return apiError(409, "name_taken", "You already have a template with that name.");
  if (error) return dbError(error);
  return jsonResponse({ template: { id: data.id, name: data.name, updatedAt: data.updated_at } }, { status: 201 });
}
