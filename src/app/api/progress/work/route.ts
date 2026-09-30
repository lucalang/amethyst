import { z } from "zod";
import { dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

const schema = z
  .object({
    itemId: z.uuid(),
    episodesWatched: z.number().int().min(0).max(100_000).optional(),
    status: z.enum(["watching", "completed", "on_hold", "dropped", "plan_to_watch"]).optional(),
    score: z.number().int().min(0).max(10).optional(),
    clearScore: z.boolean().optional(),
  })
  .refine((value) => value.episodesWatched !== undefined || value.status || value.score !== undefined || value.clearScore, {
    message: "Nothing to update.",
  });

// Aggregate progress for a whole work: movie checkbox, watched count, status, score.
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data;

  const { data, error } = await ctx.supabase.rpc("set_container_progress", {
    p_item_id: body.itemId,
    p_episodes_watched: body.episodesWatched,
    p_status: body.status,
    p_score: body.score,
    p_clear_score: body.clearScore ?? false,
  });
  if (error) return dbError(error);
  return jsonResponse({ rows: data });
}
