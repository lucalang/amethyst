import { after } from "next/server";
import { z } from "zod";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { pokeWorker } from "@/lib/worker/poke";

const schema = z.object({
  applyRemote: z.array(z.number().int().positive()).max(20_000),
  enableOutbound: z.boolean(),
});

// Approve the initial preview: chosen MAL states are applied locally, the rest
// keep the archive value. Outbound writes start only when explicitly enabled.
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;

  const { data, error } = await ctx.supabase.rpc("approve_initial_sync", {
    p_apply_remote: parsed.data.applyRemote,
    p_enable_outbound: parsed.data.enableOutbound,
  });
  if (error) return error.code === "22023" ? apiError(409, "not_ready", error.message) : dbError(error);
  if (parsed.data.enableOutbound) after(pokeWorker);
  return jsonResponse({ result: data });
}
