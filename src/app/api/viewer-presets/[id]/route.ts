import { z } from "zod";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { presetNameSchema, readViewerLook, viewerLookSchema } from "@/lib/viewer-looks";
import { presetError } from "../errors";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({ name: presetNameSchema.optional(), look: viewerLookSchema.optional() })
  .strict()
  .refine((value) => value.name !== undefined || value.look !== undefined, "Nothing to update.");

const notFound = () => apiError(404, "not_found", "Preset not found.");

/** Rename a saved preset or update its look. */
export async function PATCH(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const parsed = await parseJson(request, patchSchema);
  if ("response" in parsed) return parsed.response;
  const { data, error } = await ctx.supabase
    .from("viewer_presets")
    .update({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.look !== undefined ? { look: parsed.data.look } : {}),
    })
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .select("id, name, look")
    .maybeSingle();
  if (error) return presetError(error);
  if (!data) return notFound();
  return jsonResponse({ preset: { id: data.id, name: data.name, look: readViewerLook(data.look) } });
}

/** Delete a saved preset. If it was active, the viewer falls back to the default look. */
export async function DELETE(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const { data, error } = await ctx.supabase.from("viewer_presets").delete().eq("id", id).eq("user_id", ctx.userId).select("id").maybeSingle();
  if (error) return dbError(error);
  if (!data) return notFound();
  return jsonResponse({ ok: true });
}
