import { after } from "next/server";
import { apiError, dbError, jsonResponse, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { pokeWorker } from "@/lib/worker/poke";

// Manual refresh: enqueue a full MAL list pull (deduplicated while one is active).
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;

  const { data: account } = await ctx.supabase.from("mal_accounts").select("status").eq("user_id", ctx.userId).maybeSingle();
  if (!account || account.status === "disconnected") return apiError(409, "not_connected", "Connect MyAnimeList first.");
  if (account.status === "reconnect_required") return apiError(409, "reconnect_required", "Reconnect MyAnimeList first.");

  const { error } = await ctx.supabase.from("jobs").insert({ kind: "mal_pull", input: { reason: "manual" }, dedupe_key: "mal_pull" });
  if (error && error.code !== "23505") return dbError(error);
  after(pokeWorker);
  return jsonResponse({ queued: true, alreadyRunning: error?.code === "23505" });
}
