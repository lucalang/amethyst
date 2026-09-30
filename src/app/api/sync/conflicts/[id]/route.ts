import { after } from "next/server";
import { z } from "zod";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { pokeWorker } from "@/lib/worker/poke";

const schema = z.object({ choice: z.enum(["local", "remote"]) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "Conflict not found.");
  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;

  const { error } = await ctx.supabase.rpc("resolve_sync_conflict", { p_conflict_id: id, p_choice: parsed.data.choice });
  if (error) return error.code === "22023" ? apiError(404, "not_found", "Conflict not found or already resolved.") : dbError(error);
  if (parsed.data.choice === "local") after(pokeWorker);
  return jsonResponse({ resolved: true });
}
