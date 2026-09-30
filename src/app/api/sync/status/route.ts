import { jsonResponse, requireApiUser } from "@/lib/http";

// Non-secret sync status for polling (tokens are never readable by users).
export async function GET() {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const [{ data: account }, { data: outbox }, { count: conflicts }, { data: pull }] = await Promise.all([
    ctx.supabase
      .from("mal_accounts")
      .select("status, initial_sync, outbound_enabled, mal_username, last_pull_at, last_push_at, last_error")
      .eq("user_id", ctx.userId)
      .maybeSingle(),
    ctx.supabase.from("sync_outbox").select("state").in("state", ["pending", "in_flight", "failed", "conflict"]).limit(1000),
    ctx.supabase.from("sync_conflicts").select("id", { count: "exact", head: true }).eq("state", "open"),
    ctx.supabase.from("jobs").select("status, progress, last_error, finished_at").eq("kind", "mal_pull").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const counts: Record<string, number> = {};
  for (const row of outbox ?? []) counts[row.state] = (counts[row.state] ?? 0) + 1;
  return jsonResponse({ account, outbox: counts, openConflicts: conflicts ?? 0, lastPull: pull });
}
