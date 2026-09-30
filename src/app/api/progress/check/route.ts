import { z } from "zod";
import { dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

const schema = z.object({
  itemIds: z.array(z.uuid()).min(1).max(5000),
  checked: z.boolean(),
});

// Atomic bulk check/uncheck of episodes and checklist items (aggregates and
// sync outbox are updated in the same database transaction).
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;

  const { data, error } = await ctx.supabase.rpc("set_items_checked", {
    p_item_ids: parsed.data.itemIds,
    p_checked: parsed.data.checked,
  });
  if (error) return dbError(error);
  return jsonResponse({ rows: data });
}
