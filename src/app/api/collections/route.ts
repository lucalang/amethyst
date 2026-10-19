import { categoryInputSchema } from "@/lib/categories";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, categoryInputSchema);
  if ("response" in parsed) return parsed.response;
  const { data, error } = await ctx.supabase.from("collections").insert(parsed.data).select("id, name").single();
  if (error?.code === "23505") return apiError(409, "name_taken", "You already have a category with that name.");
  if (error) return dbError(error);
  return jsonResponse({ collection: data }, { status: 201 });
}