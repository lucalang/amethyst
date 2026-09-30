import { z } from "zod";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { entryPatchSchema } from "@/lib/validation/entries";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "Entry not found.");

  const parsed = await parseJson(request, entryPatchSchema);
  if ("response" in parsed) return parsed.response;
  const { expectedVersion, coverUrl, bannerUrl, ...rest } = parsed.data;

  const patch = {
    ...rest,
    ...(coverUrl !== undefined ? { cover_url: coverUrl } : {}),
    ...(bannerUrl !== undefined ? { banner_url: bannerUrl } : {}),
  };
  if (Object.keys(patch).length === 0) return apiError(422, "invalid_input", "Nothing to update.");

  let query = ctx.supabase.from("entries").update(patch).eq("id", id);
  if (expectedVersion) query = query.eq("version", expectedVersion);
  const { data: entry, error } = await query.select("*").maybeSingle();
  if (error) return dbError(error);
  if (!entry) {
    const { data: exists } = await ctx.supabase.from("entries").select("id").eq("id", id).maybeSingle();
    return exists
      ? apiError(409, "version_conflict", "This entry changed in another tab. Reload to see the latest version.")
      : apiError(404, "not_found", "Entry not found.");
  }
  return jsonResponse({ entry });
}

export async function DELETE(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "Entry not found.");

  // Workspace folders, files and checklist items cascade with the entry.
  const { data, error } = await ctx.supabase.from("entries").delete().eq("id", id).select("id").maybeSingle();
  if (error) return dbError(error);
  if (!data) return apiError(404, "not_found", "Entry not found.");
  return jsonResponse({ deleted: true });
}
