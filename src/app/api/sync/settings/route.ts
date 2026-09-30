import { z } from "zod";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

const schema = z.object({ outboundEnabled: z.boolean() });

export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;

  const { data, error } = await ctx.supabase
    .from("mal_accounts")
    .update({ outbound_enabled: parsed.data.outboundEnabled })
    .eq("user_id", ctx.userId)
    .select("outbound_enabled")
    .maybeSingle();
  if (error?.code === "23514") return apiError(409, "not_approved", "Review and approve the initial sync first.");
  if (error) return dbError(error);
  if (!data) return apiError(404, "not_connected", "MyAnimeList is not connected.");
  return jsonResponse({ outboundEnabled: data.outbound_enabled });
}
