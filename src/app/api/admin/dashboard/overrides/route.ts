import { z } from "zod";
import { requireAdminApi } from "@/lib/admin";
import { dbError, jsonResponse, parseJson, rejectCrossOrigin } from "@/lib/http";

const id = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/);
const schema = z.discriminatedUnion("kind", [
  // `id` is chosen by the client per request; a retry with the same id never queues twice.
  z.object({ kind: z.literal("loot"), id: z.uuid(), case: id, item: id }).strict(),
  // Stops only: the database reads the symbols and the paytable itself.
  z.object({ kind: z.literal("slots"), id: z.uuid(), stops: z.array(z.number().int().min(0).max(999)).length(3) }).strict(),
]);

/** Queue a one-time outcome for the calling admin's own next opening or spin. */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireAdminApi();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;

  const body = parsed.data;
  const { data, error } =
    body.kind === "loot"
      ? await ctx.supabase.rpc("admin_queue_loot_override", { p_id: body.id, p_case: body.case, p_item: body.item })
      : await ctx.supabase.rpc("admin_queue_slot_override", { p_id: body.id, p_stops: body.stops });
  if (error) return dbError(error, "The override couldn’t be queued. Nothing was queued.");
  return jsonResponse(data);
}
