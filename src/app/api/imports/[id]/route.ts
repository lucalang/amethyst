import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, dbError, jsonResponse, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { JOB_COLUMNS } from "@/lib/jobs";

const idSchema = z.uuid();

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError(404, "not_found", "Job not found.");

  // RLS limits this to the caller's own jobs; other users' ids are indistinguishable from missing ones.
  const { data, error } = await ctx.supabase.from("jobs").select(JOB_COLUMNS).eq("id", id).maybeSingle();
  if (error) return dbError(error);
  if (!data) return apiError(404, "not_found", "Job not found.");
  return jsonResponse({ job: data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError(404, "not_found", "Job not found.");

  const { data, error } = await ctx.supabase
    .from("jobs")
    .update({ status: "cancelled" })
    .eq("id", id)
    .in("status", ["queued", "running"])
    .select("id, status")
    .maybeSingle();
  if (error) return dbError(error);
  if (!data) return apiError(404, "not_found", "No active job with that id.");
  return jsonResponse({ job: data });
}
