import { z } from "zod";
import { requireAdminApi } from "@/lib/admin";
import { dbError, jsonResponse, parseJson, rejectCrossOrigin } from "@/lib/http";

const schema = z.object({ kind: z.enum(["loot", "slots"]), id: z.uuid() }).strict();

/** Cancel one of your own unused overrides. Cancelling twice is harmless. */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireAdminApi();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;

  const { data, error } = await ctx.supabase.rpc("admin_cancel_override", { p_kind: parsed.data.kind, p_id: parsed.data.id });
  if (error) return dbError(error, "The override couldn’t be cancelled.");
  return jsonResponse(data);
}
