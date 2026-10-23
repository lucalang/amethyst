import { z } from "zod";
import { apiError, jsonResponse, requireApiUser } from "@/lib/http";

const querySchema = z.string().trim().max(100);

/** Entry search for pickers: `?q=` matches titles (case-insensitive), newest first, at most 20. */
export async function GET(request: Request) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = querySchema.safeParse(new URL(request.url).searchParams.get("q") ?? "");
  if (!parsed.success) return apiError(422, "invalid_input", "Search for at most 100 characters.");
  let query = ctx.supabase
    .from("entries")
    .select("id, title, collection_id, cover_url, cover_shape")
    .order("updated_at", { ascending: false })
    .order("id")
    .limit(20);
  if (parsed.data) query = query.ilike("title", `%${parsed.data.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
  const [{ data, error }, collections] = await Promise.all([query, ctx.supabase.from("collections").select("id, name")]);
  if (error || collections.error) return apiError(500, "server_error", "Could not search entries.");
  const names = new Map(collections.data.map((collection) => [collection.id, collection.name]));
  return jsonResponse({
    entries: data.map((entry) => ({
      id: entry.id,
      title: entry.title,
      collectionId: entry.collection_id,
      collectionName: names.get(entry.collection_id) ?? "",
      coverUrl: entry.cover_url,
      coverShape: entry.cover_shape,
    })),
  });
}
