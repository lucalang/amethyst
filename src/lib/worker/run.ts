// Durable job + outbox worker. Shared by the Supabase Edge Function (Deno,
// scheduled by pg_cron) and the Node runner in scripts/worker.ts.
import type { Database, Tables } from "../supabase/database.types.ts";
import { ProviderError, RateLimitedError, backoffMs } from "../providers/http.ts";
import { createJikanClient } from "../providers/jikan.ts";
import { MalUnauthorizedError, createMalApi, type MalApi, type MalListStatus } from "../providers/mal.ts";
import {
  ImportFatalError,
  checkpointProgress,
  importInputSchema,
  initialCheckpoint,
  isCheckpoint,
  runImportSlice,
} from "../imports/pipeline.ts";
import { importEncryptionKey } from "../sync/crypto.ts";
import type { OAuthClient } from "../sync/mal-oauth.ts";
import { decidePull, decidePush, normalizeState, type SyncState } from "../sync/reconcile.ts";
import { ReconnectRequiredError, getValidAccessToken } from "../sync/tokens.ts";
import { createDbCache, createDbThrottle, createImportSink, toJson, type Admin } from "./stores.ts";

export type WorkerConfig = {
  workerId: string;
  budgetMs: number;
  jikanBaseUrl: string;
  jikanIntervalMs: number;
  malIntervalMs: number;
  mal: (OAuthClient & { apiBaseUrl: string }) | null;
  encryptionKey: string | null;
};

export type WorkerDeps = {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};

export type WorkerReport = {
  jobs: { id: string; kind: string; outcome: string }[];
  outbox: { id: string; outcome: string }[];
};

type Job = Tables<"jobs">;
type OutboxRow = Tables<"sync_outbox">;

class LeaseLostError extends Error {}

const MAX_OUTBOX_ATTEMPTS = 6;

export async function runWorker(db: Admin, config: WorkerConfig, deps: WorkerDeps): Promise<WorkerReport> {
  const deadline = deps.now() + config.budgetMs;
  const report: WorkerReport = { jobs: [], outbox: [] };
  const ctx = new WorkerContext(db, config, deps, deadline);

  await db.rpc("release_stale_outbox");

  while (deps.now() < deadline - 3_000) {
    const { data: jobs, error } = await db.rpc("claim_jobs", {
      p_worker: config.workerId,
      p_limit: 1,
      p_lease_seconds: Math.ceil(config.budgetMs / 1000) + 90,
    });
    if (error) throw new Error(`claim_jobs failed: ${error.code ?? error.message}`);
    if (!jobs || jobs.length === 0) break;
    for (const job of jobs) {
      const outcome = await ctx.processJob(job);
      report.jobs.push({ id: job.id, kind: job.kind, outcome });
    }
  }

  report.outbox = await ctx.processOutbox();
  return report;
}

class WorkerContext {
  private keyPromise: Promise<CryptoKey> | null = null;
  private mal: MalApi | null = null;

  constructor(
    private readonly db: Admin,
    private readonly config: WorkerConfig,
    private readonly deps: WorkerDeps,
    private readonly deadline: number,
  ) {}

  private shouldYield = () => this.deps.now() > this.deadline;

  private key(): Promise<CryptoKey> {
    if (!this.config.encryptionKey) throw new Error("TOKEN_ENCRYPTION_KEY is not configured for the worker");
    this.keyPromise ??= importEncryptionKey(this.config.encryptionKey);
    return this.keyPromise;
  }

  private malApi(): MalApi {
    if (!this.config.mal) throw new Error("MyAnimeList is not configured for the worker");
    this.mal ??= createMalApi({
      apiBaseUrl: this.config.mal.apiBaseUrl,
      http: {
        fetch: this.deps.fetch,
        sleep: this.deps.sleep,
        now: this.deps.now,
        throttle: createDbThrottle(this.db, "mal", this.config.malIntervalMs, this.deps.sleep),
      },
      maxInlineWaitMs: 10_000,
    });
    return this.mal;
  }

  private async accessToken(userId: string, forceRefresh = false): Promise<string> {
    if (!this.config.mal) throw new Error("MyAnimeList is not configured for the worker");
    return getValidAccessToken(this.db, await this.key(), this.config.mal, userId, { forceRefresh, fetch: this.deps.fetch });
  }

  // ---------------------------------------------------------------- jobs --

  async processJob(job: Job): Promise<string> {
    try {
      if (job.kind === "franchise_import") return await this.runImport(job);
      if (job.kind === "mal_pull") return await this.runMalPull(job);
      await this.finishJob(job, "failed", { last_error: `Unknown job kind ${job.kind}` });
      return "failed";
    } catch (error) {
      if (error instanceof LeaseLostError) return "lease_lost";
      if (error instanceof RateLimitedError) {
        await this.requeue(job, error.retryAfterMs, { last_error: "Waiting for provider rate limit" });
        return "rate_limited";
      }
      if (error instanceof ImportFatalError) {
        await this.finishJob(job, "failed", { last_error: error.message });
        return "failed";
      }
      if (error instanceof ReconnectRequiredError) {
        await this.finishJob(job, "failed", { last_error: "MyAnimeList connection needs to be re-authorized." });
        return "reconnect_required";
      }
      const attempts = job.attempts + 1;
      const message = sanitizeError(error);
      if (attempts >= job.max_attempts) {
        await this.finishJob(job, "failed", { attempts, last_error: message });
        return "failed";
      }
      await this.requeue(job, backoffMs(attempts, 5_000, 10 * 60_000), { attempts, last_error: message });
      return "retry";
    }
  }

  private async saveJob(job: Job, patch: Database["public"]["Tables"]["jobs"]["Update"]) {
    const { data, error } = await this.db
      .from("jobs")
      .update(patch)
      .eq("id", job.id)
      .eq("locked_by", this.config.workerId)
      .eq("status", "running")
      .select("id");
    if (error) throw new Error(`job update failed: ${error.code ?? error.message}`);
    if (!data || data.length === 0) throw new LeaseLostError();
  }

  private async requeue(job: Job, delayMs: number, patch: Database["public"]["Tables"]["jobs"]["Update"] = {}) {
    await this.db
      .from("jobs")
      .update({
        ...patch,
        status: "queued",
        locked_by: null,
        locked_until: null,
        run_after: new Date(Date.now() + Math.max(0, delayMs)).toISOString(),
      })
      .eq("id", job.id)
      .eq("locked_by", this.config.workerId)
      .eq("status", "running");
  }

  private async finishJob(job: Job, status: "succeeded" | "failed", patch: Database["public"]["Tables"]["jobs"]["Update"] = {}) {
    await this.db
      .from("jobs")
      .update({ ...patch, status, locked_by: null, locked_until: null, finished_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("locked_by", this.config.workerId)
      .eq("status", "running");
  }

  private async runImport(job: Job): Promise<string> {
    const parsed = importInputSchema.safeParse(job.input);
    if (!parsed.success) {
      await this.finishJob(job, "failed", { last_error: "Invalid import input." });
      return "failed";
    }
    const input = parsed.data;
    const cp = isCheckpoint(job.checkpoint) ? job.checkpoint : initialCheckpoint(input);
    const jikan = createJikanClient({
      baseUrl: this.config.jikanBaseUrl,
      http: {
        fetch: this.deps.fetch,
        sleep: this.deps.sleep,
        now: this.deps.now,
        throttle: createDbThrottle(this.db, "jikan", this.config.jikanIntervalMs, this.deps.sleep),
      },
      cache: createDbCache(this.db),
      maxInlineWaitMs: 10_000,
    });

    const { done } = await runImportSlice(cp, {
      jikan,
      sink: createImportSink(this.db, job.id),
      input,
      shouldYield: this.shouldYield,
      // Persist after every step; on failure the last saved checkpoint is resumed.
      onCheckpoint: (state) =>
        this.saveJob(job, {
          checkpoint: toJson(state),
          progress: toJson(checkpointProgress(state)),
          warnings: toJson(state.warnings),
        }),
    });
    if (done) return "succeeded";
    await this.requeue(job, 0);
    return "yielded";
  }

  private async runMalPull(job: Job): Promise<string> {
    const { data: account } = await this.db.from("mal_accounts").select("*").eq("user_id", job.user_id).maybeSingle();
    if (!account || account.status === "disconnected") {
      await this.finishJob(job, "failed", { last_error: "MyAnimeList is not connected." });
      return "failed";
    }
    const mal = this.malApi();
    const cp = (job.checkpoint ?? {}) as { offset?: number; startedAt?: string };
    let offset = cp.offset ?? 0;
    const startedAt = cp.startedAt ?? new Date().toISOString();
    let token = await this.accessToken(job.user_id);

    for (;;) {
      if (this.shouldYield()) {
        await this.requeue(job, 0, { checkpoint: { offset, startedAt } });
        return "yielded";
      }
      let page;
      try {
        page = await mal.getAnimeListPage(token, offset);
      } catch (error) {
        if (!(error instanceof MalUnauthorizedError)) throw error;
        token = await this.accessToken(job.user_id, true);
        page = await mal.getAnimeListPage(token, offset);
      }
      if (page.entries.length > 0) {
        const { error } = await this.db.from("mal_list_entries").upsert(
          page.entries.map((entry) => ({
            user_id: job.user_id,
            mal_id: entry.malId,
            title: entry.title.slice(0, 500),
            image_url: entry.imageUrl,
            media_type: entry.mediaType,
            num_episodes: entry.numEpisodes,
            status: entry.listStatus.status,
            score: entry.listStatus.score,
            num_episodes_watched: entry.listStatus.watched,
            remote_updated_at: entry.listStatus.updatedAt,
            pulled_at: startedAt,
          })),
          { onConflict: "user_id,mal_id" },
        );
        if (error) throw new Error(`mal_list_entries upsert failed: ${error.code}`);
      }
      offset += page.entries.length;
      await this.saveJob(job, {
        checkpoint: { offset, startedAt },
        progress: { phase: "pull", message: `Pulled ${offset} list entries` },
      });
      if (!page.hasNext || page.entries.length === 0) break;
    }

    // The snapshot mirrors MAL; removals only affect the cached list, never local progress.
    await this.db.from("mal_list_entries").delete().eq("user_id", job.user_id).lt("pulled_at", startedAt);

    const reconcileSummary =
      account.initial_sync === "approved" ? await this.reconcileUser(job.user_id) : { applied: 0, conflicts: 0, adopted: 0 };

    await this.db
      .from("mal_accounts")
      .update({
        last_pull_at: new Date().toISOString(),
        last_error: null,
        ...(account.initial_sync === "pending" ? { initial_sync: "ready" } : {}),
      })
      .eq("user_id", job.user_id);

    await this.finishJob(job, "succeeded", {
      result: { entries: offset, ...reconcileSummary },
      progress: { phase: "done", message: `Pulled ${offset} list entries` },
    });
    return "succeeded";
  }

  /** Apply remote changes to linked works using baselines; never overwrite silently. */
  async reconcileUser(userId: string) {
    const remote = await selectAll((from, to) =>
      this.db.from("mal_list_entries").select("*").eq("user_id", userId).range(from, to),
    );
    const items = await selectAll((from, to) =>
      this.db
        .from("media_items")
        .select("id, mal_id")
        .eq("user_id", userId)
        .not("mal_id", "is", null)
        .in("kind", ["series", "movie", "ova", "ona", "special"])
        .range(from, to),
    );
    const itemByMal = new Map(items.map((item) => [Number(item.mal_id), item.id]));
    const linked = remote.filter((entry) => itemByMal.has(Number(entry.mal_id)));
    const ids = linked.map((entry) => itemByMal.get(Number(entry.mal_id))!);

    const [progress, baselines, pending] = await Promise.all([
      selectIn(ids, (chunk) => this.db.from("user_progress").select("*").eq("user_id", userId).in("media_item_id", chunk)),
      selectIn(ids, (chunk) => this.db.from("sync_baselines").select("*").eq("user_id", userId).in("media_item_id", chunk)),
      selectIn(ids, (chunk) =>
        this.db.from("sync_outbox").select("media_item_id, id, state").eq("user_id", userId).in("state", ["pending", "in_flight"]).in("media_item_id", chunk),
      ),
    ]);
    const progressById = new Map(progress.map((row) => [row.media_item_id, row]));
    const baselineById = new Map(baselines.map((row) => [row.media_item_id, row]));
    const pendingById = new Map(pending.map((row) => [row.media_item_id, row]));

    const summary = { applied: 0, conflicts: 0, adopted: 0 };
    for (const entry of linked) {
      const mediaItemId = itemByMal.get(Number(entry.mal_id))!;
      const local = progressById.get(mediaItemId);
      const baseline = baselineById.get(mediaItemId);
      const remoteState = normalizeState({ status: entry.status, score: entry.score, watched: entry.num_episodes_watched });
      const localState = local ? normalizeState({ status: local.status, score: local.score, watched: local.episodes_watched }) : null;
      const baselineState = baseline ? normalizeState({ status: baseline.status, score: baseline.score, watched: baseline.episodes_watched }) : null;
      const pendingRow = pendingById.get(mediaItemId);
      const decision = decidePull({ local: localState, remote: remoteState, baseline: baselineState, pendingPush: Boolean(pendingRow) });

      if (decision === "apply_remote") {
        const { error } = await this.db.rpc("apply_mal_remote", {
          p_user: userId,
          p_media_item_id: mediaItemId,
          p_status: remoteState.status,
          p_score: remoteState.score,
          p_watched: remoteState.watched,
          p_remote_updated_at: entry.remote_updated_at ?? undefined,
        });
        if (error) throw new Error(`apply_mal_remote failed: ${error.code}`);
        summary.applied++;
      } else if (decision === "adopt_baseline") {
        await this.upsertBaseline(userId, mediaItemId, Number(entry.mal_id), remoteState, entry.remote_updated_at);
        summary.adopted++;
      } else if (decision === "conflict") {
        await this.db.rpc("record_sync_conflict", {
          p_user: userId,
          p_media_item_id: mediaItemId,
          p_mal_id: Number(entry.mal_id),
          p_local: toWire(localState ?? normalizeState({})),
          p_remote: { ...toWire(remoteState), updated_at: entry.remote_updated_at },
          p_baseline: baselineState ? toWire(baselineState) : null,
        });
        if (pendingRow?.state === "pending") {
          await this.db.from("sync_outbox").update({ state: "conflict", completed_at: new Date().toISOString() }).eq("id", pendingRow.id);
        }
        summary.conflicts++;
      }
    }
    return summary;
  }

  private async upsertBaseline(userId: string, mediaItemId: string, malId: number, state: SyncState, remoteUpdatedAt: string | null) {
    const { error } = await this.db.from("sync_baselines").upsert(
      {
        user_id: userId,
        media_item_id: mediaItemId,
        mal_id: malId,
        status: state.status,
        score: state.score,
        episodes_watched: state.watched,
        remote_updated_at: remoteUpdatedAt,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "user_id,media_item_id" },
    );
    if (error) throw new Error(`baseline upsert failed: ${error.code}`);
  }

  // -------------------------------------------------------------- outbox --

  async processOutbox(): Promise<WorkerReport["outbox"]> {
    const results: WorkerReport["outbox"] = [];
    if (!this.config.mal || !this.config.encryptionKey) return results;

    while (!this.shouldYield()) {
      const { data: rows, error } = await this.db.rpc("claim_outbox", {
        p_worker: this.config.workerId,
        p_limit: 10,
        p_lease_seconds: 120,
      });
      if (error) throw new Error(`claim_outbox failed: ${error.code ?? error.message}`);
      if (!rows || rows.length === 0) break;

      const byUser = new Map<string, OutboxRow[]>();
      for (const row of rows) byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);

      for (const [userId, userRows] of byUser) {
        let token: string;
        try {
          token = await this.accessToken(userId);
        } catch (tokenError) {
          const delay = tokenError instanceof ReconnectRequiredError ? 0 : 60_000;
          for (const row of userRows) {
            await this.releaseOutbox(row, delay, sanitizeError(tokenError), false);
            results.push({ id: row.id, outcome: tokenError instanceof ReconnectRequiredError ? "reconnect_required" : "deferred" });
          }
          continue;
        }
        for (const row of userRows) {
          if (this.shouldYield()) {
            await this.releaseOutbox(row, 0, null, false);
            continue;
          }
          const outcome = await this.pushRow(row, token, (fresh) => (token = fresh));
          results.push({ id: row.id, outcome });
        }
      }
    }
    return results;
  }

  private async pushRow(row: OutboxRow, token: string, setToken: (token: string) => void): Promise<string> {
    const mal = this.malApi();
    const wire = row.desired as { status?: string; score?: number; num_watched_episodes?: number };
    const desired = normalizeState({ status: wire.status, score: wire.score, watched: wire.num_watched_episodes });

    const withAuth = async <T>(fn: (accessToken: string) => Promise<T>): Promise<T> => {
      try {
        return await fn(token);
      } catch (error) {
        if (!(error instanceof MalUnauthorizedError)) throw error;
        token = await this.accessToken(row.user_id, true);
        setToken(token);
        return fn(token);
      }
    };

    try {
      const remote = await withAuth((accessToken) => mal.getMyListStatus(accessToken, Number(row.mal_id)));
      const { data: baselineRow } = await this.db
        .from("sync_baselines")
        .select("*")
        .eq("user_id", row.user_id)
        .eq("media_item_id", row.media_item_id)
        .maybeSingle();
      const baseline = baselineRow
        ? normalizeState({ status: baselineRow.status, score: baselineRow.score, watched: baselineRow.episodes_watched })
        : null;
      const remoteState = remote ? fromMal(remote) : null;
      const decision = decidePush({ desired, remote: remoteState, baseline });

      if (decision === "conflict") {
        const remoteWire = remoteState
          ? { ...toWire(remoteState), updated_at: remote?.updatedAt ?? null }
          : { ...toWire(normalizeState({})), updated_at: null, removed: true };
        await this.db.rpc("record_sync_conflict", {
          p_user: row.user_id,
          p_media_item_id: row.media_item_id,
          p_mal_id: Number(row.mal_id),
          p_local: toWire(desired),
          p_remote: remoteWire,
          p_baseline: baseline ? toWire(baseline) : null,
        });
        await this.completeOutbox(row, "conflict", remoteState ? "Changed on MyAnimeList since the last sync." : "Removed from the MyAnimeList list since the last sync.");
        return "conflict";
      }

      let agreed: MalListStatus;
      if (decision === "noop") {
        agreed = remote!;
      } else {
        agreed = await withAuth((accessToken) =>
          mal.updateMyListStatus(accessToken, Number(row.mal_id), {
            status: desired.status,
            score: desired.score,
            num_watched_episodes: desired.watched,
          }),
        );
        await this.db.from("mal_accounts").update({ last_push_at: new Date().toISOString(), last_error: null }).eq("user_id", row.user_id);
      }
      await this.upsertBaseline(row.user_id, row.media_item_id, Number(row.mal_id), fromMal(agreed), agreed.updatedAt);
      await this.completeOutbox(row, "synced", null);
      return decision === "noop" ? "already_in_sync" : "synced";
    } catch (error) {
      if (error instanceof RateLimitedError) {
        await this.releaseOutbox(row, error.retryAfterMs, "Waiting for MyAnimeList rate limit", false);
        return "rate_limited";
      }
      if (error instanceof ReconnectRequiredError) {
        await this.releaseOutbox(row, 0, "Reconnect required", false);
        return "reconnect_required";
      }
      if (error instanceof ProviderError && !error.retryable) {
        await this.completeOutbox(row, "failed", sanitizeError(error));
        return "failed";
      }
      if (row.attempts + 1 >= MAX_OUTBOX_ATTEMPTS) {
        await this.completeOutbox(row, "failed", sanitizeError(error));
        return "failed";
      }
      await this.releaseOutbox(row, backoffMs(row.attempts + 1, 30_000, 30 * 60_000), sanitizeError(error), true);
      return "retry";
    }
  }

  private async completeOutbox(row: OutboxRow, state: "synced" | "failed" | "conflict", message: string | null) {
    await this.db
      .from("sync_outbox")
      .update({ state, last_error: message, locked_by: null, locked_until: null, completed_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("locked_by", this.config.workerId)
      .eq("state", "in_flight");
  }

  private async releaseOutbox(row: OutboxRow, delayMs: number, message: string | null, countAttempt: boolean) {
    const { error } = await this.db
      .from("sync_outbox")
      .update({
        state: "pending",
        locked_by: null,
        locked_until: null,
        last_error: message,
        attempts: countAttempt ? row.attempts + 1 : row.attempts,
        not_before: new Date(Date.now() + delayMs).toISOString(),
      })
      .eq("id", row.id)
      .eq("locked_by", this.config.workerId)
      .eq("state", "in_flight");
    if (error?.code === "23505") {
      // A newer pending change exists for this item; it supersedes this one.
      await this.db
        .from("sync_outbox")
        .update({ state: "superseded", locked_by: null, locked_until: null, completed_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("locked_by", this.config.workerId)
        .eq("state", "in_flight");
    }
  }
}

function fromMal(status: MalListStatus): SyncState {
  return { status: status.status, score: status.score, watched: status.watched };
}

function toWire(state: SyncState) {
  return { status: state.status, score: state.score, num_watched_episodes: state.watched };
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // Never persist anything that looks like a credential.
  return message.replace(/(bearer|token|secret|code)[=: ]+\S+/gi, "$1=[redacted]").slice(0, 300);
}

const PAGE = 1000;

async function selectAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw new Error("paged select failed");
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

async function selectIn<T>(ids: string[], query: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await query(ids.slice(i, i + 200));
    if (error) throw new Error("chunked select failed");
    rows.push(...(data ?? []));
  }
  return rows;
}
