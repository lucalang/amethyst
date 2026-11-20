import { z } from "zod";
import { SPIN_WHEEL_COLUMNS, toSavedWheel } from "@/lib/data/spin-wheels";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { updateWheelSchema } from "@/lib/spin-wheel";

type Params = { params: Promise<{ id: string }> };

const notFound = () => apiError(404, "not_found", "That wheel no longer exists.");

export async function PATCH(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const parsed = await parseJson(request, updateWheelSchema);
  if ("response" in parsed) return parsed.response;
  const { name, choices, settings, expectedVersion } = parsed.data;

  let query = ctx.supabase
    .from("spin_wheels")
    .update({
      ...(name !== undefined ? { name } : {}),
      ...(choices !== undefined ? { choices } : {}),
      ...(settings !== undefined ? { settings } : {}),
    })
    .eq("id", id);
  if (expectedVersion !== undefined) query = query.eq("version", expectedVersion);
  const { data, error } = await query.select(SPIN_WHEEL_COLUMNS).maybeSingle();
  if (error) return dbError(error);
  if (!data) {
    const { data: exists } = await ctx.supabase.from("spin_wheels").select("id").eq("id", id).maybeSingle();
    return exists ? apiError(409, "version_conflict", "This wheel was changed somewhere else (another tab or device).") : notFound();
  }
  return jsonResponse({ wheel: toSavedWheel(data) });
}

export async function DELETE(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const { data, error } = await ctx.supabase.from("spin_wheels").delete().eq("id", id).select("id").maybeSingle();
  if (error) return dbError(error);
  return data ? new Response(null, { status: 204 }) : notFound();
}
