import { z } from "zod";
import { dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

const schema = z.object({ itemId: z.uuid(), confirm: z.literal(true) });

// Explicit, user-confirmed mapping of an aggregate watched count (e.g. from
// MyAnimeList) to "the first N episodes". Never performed implicitly.
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;

  const { data, error } = await ctx.supabase.rpc("map_watched_count_to_episodes", { p_item_id: parsed.data.itemId });
  if (error) return dbError(error);
  return jsonResponse({ rows: data });
}
