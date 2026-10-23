import { z } from "zod";
import { dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

const orderSchema = z.object({ ids: z.array(z.uuid()).max(1000) }).strict();

/** Persist the complete order of the user's collections. */
export async function PUT(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, orderSchema);
  if ("response" in parsed) return parsed.response;
  const { error } = await ctx.supabase.rpc("reorder_collections", { p_collection_ids: parsed.data.ids });
  if (error) return dbError(error);
  return jsonResponse({ ok: true });
}
