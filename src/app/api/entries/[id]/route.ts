import { z } from "zod";
import { allowedImageHosts } from "@/lib/env";
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

  const parsed = await parseJson(request, entryPatchSchema(allowedImageHosts()));
  if ("response" in parsed) return parsed.response;
  const { expectedVersion, platform, coverUrl, bannerUrl, ...rest } = parsed.data;

  const patch = {
    ...rest,
    ...(coverUrl !== undefined ? { cover_url: coverUrl } : {}),
    ...(bannerUrl !== undefined ? { banner_url: bannerUrl } : {}),
  };

  if (Object.keys(patch).length > 0) {
    let query = ctx.supabase.from("entries").update(patch).eq("id", id);
    if (expectedVersion) query = query.eq("version", expectedVersion);
    const { data, error } = await query.select("id, version").maybeSingle();
    if (error) return dbError(error);
    if (!data) {
      const { data: exists } = await ctx.supabase.from("entries").select("id").eq("id", id).maybeSingle();
      return exists
        ? apiError(409, "version_conflict", "This entry changed in another tab. Reload to see the latest version.")
        : apiError(404, "not_found", "Entry not found.");
    }
  }

  if (platform !== undefined) {
    const { error } = await ctx.supabase.from("custom_games").update({ platform }).eq("entry_id", id);
    if (error) return dbError(error);
  }

  const { data: entry } = await ctx.supabase.from("entries").select("*").eq("id", id).single();
  return jsonResponse({ entry });
}

export async function DELETE(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "Entry not found.");

  // Custom checklist items belong to exactly one entry; remove them with it.
  const { data: owned } = await ctx.supabase
    .from("entry_media_items")
    .select("media_item_id")
    .eq("entry_id", id)
    .eq("section", "checklist");
  const { data, error } = await ctx.supabase.from("entries").delete().eq("id", id).select("id").maybeSingle();
  if (error) return dbError(error);
  if (!data) return apiError(404, "not_found", "Entry not found.");
  const checklistIds = (owned ?? []).map((row) => row.media_item_id);
  if (checklistIds.length > 0) await ctx.supabase.from("media_items").delete().in("id", checklistIds).eq("kind", "checklist");
  return jsonResponse({ deleted: true });
}
