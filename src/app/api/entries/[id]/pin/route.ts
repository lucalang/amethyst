import { z } from "zod";
import { apiError, dbError, jsonResponse, rejectCrossOrigin, requireApiUser } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

async function prepare(request: Request, params: Params["params"]) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "Entry not found.");
  return { ctx, id };
}

/** Pin an entry to Home (idempotent). */
export async function PUT(request: Request, { params }: Params) {
  const prepared = await prepare(request, params);
  if (prepared instanceof Response) return prepared;
  const { error } = await prepared.ctx.supabase.from("entry_pins").insert({ entry_id: prepared.id });
  if (error && error.code !== "23505") return dbError(error);
  return jsonResponse({ pinned: true });
}

/** Unpin an entry from Home (idempotent). */
export async function DELETE(request: Request, { params }: Params) {
  const prepared = await prepare(request, params);
  if (prepared instanceof Response) return prepared;
  const { error } = await prepared.ctx.supabase.from("entry_pins").delete().eq("entry_id", prepared.id);
  if (error) return dbError(error);
  return jsonResponse({ pinned: false });
}
