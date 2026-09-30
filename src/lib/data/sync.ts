import "server-only";
import type { AuthContext } from "@/lib/supabase/auth";
import type { Tables } from "@/lib/supabase/database.types";
import { buildSyncPreview, normalizeState, type PreviewRow, type SyncState } from "@/lib/sync/reconcile";
import { fetchAll } from "./fetch-all";

export type ConflictView = {
  id: string;
  mediaItemId: string;
  malId: number;
  title: string;
  local: SyncState;
  remote: SyncState & { removed?: boolean };
  createdAt: string;
};

export type OutboxView = {
  id: string;
  title: string;
  state: string;
  desired: SyncState;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
};

export type SyncData = {
  account: Tables<"mal_accounts"> | null;
  preview: PreviewRow[];
  conflicts: ConflictView[];
  outbox: OutboxView[];
  counts: Record<string, number>;
  lastPull: { status: string; last_error: string | null; progress: unknown; finished_at: string | null; created_at: string } | null;
};

const wire = (value: unknown): SyncState & { removed?: boolean } => {
  const record = (value ?? {}) as { status?: string; score?: number; num_watched_episodes?: number; removed?: boolean };
  return { ...normalizeState({ status: record.status, score: record.score, watched: record.num_watched_episodes }), removed: record.removed };
};

export async function loadSyncData(ctx: AuthContext): Promise<SyncData> {
  const { supabase } = ctx;
  const [{ data: account }, remote, works, { data: conflictRows }, { data: outboxRows }, { data: lastPull }] = await Promise.all([
    supabase.from("mal_accounts").select("*").eq("user_id", ctx.userId).maybeSingle(),
    fetchAll((from, to) => supabase.from("mal_list_entries").select("*").order("title").range(from, to)),
    fetchAll((from, to) =>
      supabase.from("media_items").select("id, mal_id, title").not("mal_id", "is", null).in("kind", ["series", "movie", "ova", "ona", "special"]).range(from, to),
    ),
    supabase.from("sync_conflicts").select("*").eq("state", "open").order("created_at", { ascending: false }).limit(200),
    supabase.from("sync_outbox").select("*").order("updated_at", { ascending: false }).limit(50),
    supabase.from("jobs").select("status, last_error, progress, finished_at, created_at").eq("kind", "mal_pull").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const workByMal = new Map(works.map((work) => [Number(work.mal_id), work]));
  const titleById = new Map(works.map((work) => [work.id, work.title]));
  const linkedIds = remote.map((entry) => workByMal.get(Number(entry.mal_id))?.id).filter((id): id is string => Boolean(id));

  const progress: Tables<"user_progress">[] = [];
  for (let index = 0; index < linkedIds.length; index += 200) {
    const { data } = await supabase.from("user_progress").select("*").in("media_item_id", linkedIds.slice(index, index + 200));
    progress.push(...(data ?? []));
  }
  const progressById = new Map(progress.map((row) => [row.media_item_id, row]));

  const localByMal = new Map<number, { mediaItemId: string; state: SyncState | null }>();
  for (const entry of remote) {
    const work = workByMal.get(Number(entry.mal_id));
    if (!work) continue;
    const row = progressById.get(work.id);
    localByMal.set(Number(entry.mal_id), {
      mediaItemId: work.id,
      state: row ? normalizeState({ status: row.status, score: row.score, watched: row.episodes_watched }) : null,
    });
  }

  const preview = buildSyncPreview(
    remote.map((entry) => ({
      malId: Number(entry.mal_id),
      title: entry.title,
      imageUrl: entry.image_url,
      state: normalizeState({ status: entry.status, score: entry.score, watched: entry.num_episodes_watched }),
    })),
    localByMal,
  );

  const counts: Record<string, number> = {};
  for (const row of outboxRows ?? []) counts[row.state] = (counts[row.state] ?? 0) + 1;

  return {
    account,
    preview,
    conflicts: (conflictRows ?? []).map((row) => ({
      id: row.id,
      mediaItemId: row.media_item_id,
      malId: Number(row.mal_id),
      title: titleById.get(row.media_item_id) ?? `MAL #${row.mal_id}`,
      local: wire(row.local),
      remote: wire(row.remote),
      createdAt: row.created_at,
    })),
    outbox: (outboxRows ?? []).map((row) => ({
      id: row.id,
      title: titleById.get(row.media_item_id) ?? `MAL #${row.mal_id}`,
      state: row.state,
      desired: wire(row.desired),
      attempts: row.attempts,
      lastError: row.last_error,
      updatedAt: row.updated_at,
    })),
    counts,
    lastPull: lastPull ?? null,
  };
}
