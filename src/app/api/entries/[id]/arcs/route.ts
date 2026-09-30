import { z } from "zod";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

const schema = z
  .object({
    seriesItemId: z.uuid(),
    title: z.string().trim().min(1).max(200),
    start: z.number().int().min(1).max(100_000),
    end: z.number().int().min(1).max(100_000),
  })
  .refine((value) => value.end >= value.start, { message: "End episode must be after the start.", path: ["end"] });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "Franchise not found.");
  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;

  const { data, error } = await ctx.supabase.rpc("create_arc", {
    p_entry_id: id,
    p_series_item_id: parsed.data.seriesItemId,
    p_title: parsed.data.title,
    p_start: parsed.data.start,
    p_end: parsed.data.end,
  });
  if (error) return dbError(error);
  const { data: members } = await ctx.supabase.from("arc_items").select("media_item_id").eq("arc_id", data.id);
  return jsonResponse({ arc: data, memberIds: (members ?? []).map((row) => row.media_item_id) }, { status: 201 });
}
