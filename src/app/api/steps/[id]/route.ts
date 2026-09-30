import { z } from "zod";
import { STEP_COLUMNS } from "@/lib/data/workspace";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { updateStepSchema } from "@/lib/validation/workspace";

type Params = { params: Promise<{ id: string }> };

const notFound = () => apiError(404, "not_found", "Step not found.");

export async function PATCH(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();

  const parsed = await parseJson(request, updateStepSchema);
  if ("response" in parsed) return parsed.response;
  const { data, error } = await ctx.supabase.from("workspace_checklist_steps").update(parsed.data).eq("id", id).select(STEP_COLUMNS).maybeSingle();
  if (error) return dbError(error);
  return data ? jsonResponse({ step: data }) : notFound();
}

export async function DELETE(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();

  const { data, error } = await ctx.supabase.from("workspace_checklist_steps").delete().eq("id", id).select("id").maybeSingle();
  if (error) return dbError(error);
  return data ? jsonResponse({ deleted: true }) : notFound();
}
