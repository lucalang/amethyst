import { z } from "zod";
import { COVER_SHAPES } from "@/lib/cover-shape";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

const schema = z.object({ coverShape: z.enum(COVER_SHAPES) }).strict();

export async function GET() {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { data, error } = await ctx.supabase.from("users").select("preferred_cover_shape").eq("id", ctx.userId).single();
  if (error) return dbError(error);
  return jsonResponse({ coverShape: data.preferred_cover_shape });
}

export async function PUT(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;
  const { data, error } = await ctx.supabase.from("users")
    .update({ preferred_cover_shape: parsed.data.coverShape }).eq("id", ctx.userId).select("id").maybeSingle();
  if (error) return dbError(error);
  if (!data) return apiError(404, "not_found", "Account not found.");
  return jsonResponse({ coverShape: parsed.data.coverShape });
}