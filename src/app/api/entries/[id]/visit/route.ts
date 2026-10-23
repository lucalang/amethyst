import { z } from "zod";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

const visitSchema = z.object({ fileId: z.uuid().nullable() }).strict();

/** Record that the user opened this entry, and which file was selected. */
export async function POST(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "Entry not found.");
  const parsed = await parseJson(request, visitSchema);
  if ("response" in parsed) return parsed.response;
  const { error } = await ctx.supabase.rpc("record_entry_visit", { p_entry_id: id, p_file_id: parsed.data.fileId });
  if (error) return dbError(error);
  return jsonResponse({ ok: true });
}
