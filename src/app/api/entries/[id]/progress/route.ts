import { z } from "zod";
import { fetchAll } from "@/lib/data/fetch-all";
import { apiError, jsonResponse, requireApiUser } from "@/lib/http";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "Entry not found.");

  const rows = await fetchAll((from, to) =>
    ctx.supabase
      .rpc("entry_progress_rows", { p_entry_id: id })
      .select("media_item_id, is_checked, episodes_watched, episodes_mapped, status, score, version, updated_at")
      .range(from, to),
  );
  return jsonResponse({ rows });
}
