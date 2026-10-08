import { categoryCreateSchema, categoryKey } from "@/lib/categories";
import { dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

/** Create a category. An existing name (any letter case) is returned instead of duplicated. */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, categoryCreateSchema);
  if ("response" in parsed) return parsed.response;

  const { data, error } = await ctx.supabase.from("categories").insert(parsed.data).select("id, name").single();
  if (!error) return jsonResponse({ category: data, created: true }, { status: 201 });
  if (error.code !== "23505") return dbError(error);

  const { data: all, error: listError } = await ctx.supabase.from("categories").select("id, name").eq("kind", parsed.data.kind);
  if (listError) return dbError(listError);
  const existing = all.find((category) => categoryKey(category.name) === categoryKey(parsed.data.name));
  return existing ? jsonResponse({ category: existing, created: false }) : dbError(error);
}
