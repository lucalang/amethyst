import { after, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { JOB_COLUMNS } from "@/lib/jobs";
import { pokeWorker } from "@/lib/worker/poke";

const createSchema = z.object({
  malId: z.number().int().positive().max(10_000_000),
  entryId: z.uuid().optional(),
  traverse: z.boolean().default(true),
  title: z.string().trim().max(300).optional(),
});

export async function GET() {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { data, error } = await ctx.supabase
    .from("jobs")
    .select(JOB_COLUMNS)
    .eq("kind", "franchise_import")
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) return dbError(error);
  return jsonResponse({ jobs: data });
}

export async function POST(request: NextRequest) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;

  const parsed = await parseJson(request, createSchema);
  if ("response" in parsed) return parsed.response;
  const { malId, entryId, traverse, title } = parsed.data;

  if (entryId) {
    const { data: entry } = await ctx.supabase.from("entries").select("id, kind").eq("id", entryId).maybeSingle();
    if (!entry || entry.kind !== "franchise") return apiError(404, "not_found", "Franchise not found.");
  }

  const dedupeKey = entryId ? `mal:${malId}:into:${entryId}` : `mal:${malId}`;
  const input = { mal_id: malId, traverse, ...(entryId ? { entry_id: entryId } : {}), ...(title ? { title } : {}) };

  const { data, error } = await ctx.supabase
    .from("jobs")
    .insert({ kind: "franchise_import", input, dedupe_key: dedupeKey })
    .select(JOB_COLUMNS)
    .single();

  if (error?.code === "23505") {
    // Duplicate import request: return the job that is already running.
    const { data: existing } = await ctx.supabase
      .from("jobs")
      .select(JOB_COLUMNS)
      .eq("dedupe_key", dedupeKey)
      .in("status", ["queued", "running"])
      .maybeSingle();
    return jsonResponse({ job: existing, duplicate: true }, { status: 200 });
  }
  if (error) return dbError(error);

  after(pokeWorker);
  return jsonResponse({ job: data, duplicate: false }, { status: 201 });
}
