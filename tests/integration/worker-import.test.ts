import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runWorker, type WorkerConfig } from "@/lib/worker/run";
import { createFixtureFetch, type FixtureFetchOptions } from "../support/jikan-fixtures";
import { adminClient, createTestUser, deleteTestUser, setScheduledWorker, type TestUser } from "../support/local-supabase";

const JIKAN = "http://jikan.test/v4";
const admin = adminClient();

function config(): WorkerConfig {
  return {
    workerId: `test-${Date.now()}`,
    budgetMs: 45_000,
    jikanBaseUrl: JIKAN,
    jikanIntervalMs: 0,
    malIntervalMs: 0,
    mal: null,
    encryptionKey: null,
  };
}

async function runFixtureWorker(options: FixtureFetchOptions = {}) {
  const fixture = createFixtureFetch(JIKAN, options);
  return runWorker(admin, config(), { fetch: fixture.fetch, sleep: async () => undefined, now: Date.now });
}

let a: TestUser;
let b: TestUser;

beforeAll(async () => {
  await setScheduledWorker(false);
  // Isolate from any leftover local jobs and cached fixture ids.
  await admin.from("jobs").update({ status: "cancelled" }).in("status", ["queued", "running"]);
  await admin.from("provider_cache").delete().eq("provider", "jikan");
  a = await createTestUser("worker-a");
  b = await createTestUser("worker-b");
});

afterAll(async () => {
  await deleteTestUser(a);
  await deleteTestUser(b);
  await setScheduledWorker(true);
});

async function enqueue(user: TestUser, malId: number) {
  const { data, error } = await user.client
    .from("jobs")
    .insert({ kind: "franchise_import", input: { mal_id: malId, traverse: true }, dedupe_key: `mal:${malId}` })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

describe("durable franchise import (worker + database)", () => {
  let entryId: string;

  it("imports a franchise into the owner's vault", async () => {
    const jobId = await enqueue(a, 1001);
    const report = await runFixtureWorker();
    expect(report.jobs.find((job) => job.id === jobId)?.outcome).toBe("succeeded");

    const { data: job } = await a.client.from("jobs").select("status, result, warnings").eq("id", jobId).single();
    expect(job?.status).toBe("succeeded");
    entryId = (job?.result as { entry_id: string }).entry_id;
    expect(entryId).toBeTruthy();

    const { data: entry } = await a.client.from("entries").select("title, kind, metadata").eq("id", entryId).single();
    expect(entry).toMatchObject({ title: "Fixture Saga", kind: "franchise" });
    const metadata = entry?.metadata as { coverage: { works: number }; warnings: { code: string }[]; candidates: { malId: number }[] };
    expect(metadata.coverage.works).toBe(6);
    expect(metadata.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(["no_episode_list", "missing_work", "not_trackable"]));
    expect(metadata.candidates.map((candidate) => candidate.malId).sort()).toEqual([1006, 2001, 2002]);

    const { count: works } = await a.client.from("media_items").select("id", { count: "exact", head: true }).neq("kind", "episode");
    const { count: episodes } = await a.client.from("media_items").select("id", { count: "exact", head: true }).eq("kind", "episode");
    expect(works).toBe(6);
    expect(episodes).toBe(29);

    const { data: episode } = await a.client.from("media_items").select("source_key, mal_id, title").eq("source_key", "mal:1001:episode:7").single();
    expect(episode).toMatchObject({ mal_id: null, title: "Episode 7" });

    const { count: characters } = await a.client.from("catalog_characters").select("character_mal_id", { count: "exact", head: true }).eq("anime_mal_id", 1001);
    expect(characters).toBe(3);
  });

  it("keeps the import invisible to another user", async () => {
    const { data: entries } = await b.client.from("entries").select("id");
    const { data: jobs } = await b.client.from("jobs").select("id");
    const { data: items } = await b.client.from("media_items").select("id");
    expect(entries).toEqual([]);
    expect(jobs).toEqual([]);
    expect(items).toEqual([]);
  });

  it("re-importing is idempotent", async () => {
    await enqueue(a, 1001);
    await runFixtureWorker();
    const { data: entries } = await a.client.from("entries").select("id").eq("kind", "franchise");
    expect(entries?.map((entry) => entry.id)).toEqual([entryId]);
    const { count } = await a.client.from("media_items").select("id", { count: "exact", head: true });
    expect(count).toBe(35);
  });

  it("imports the same franchise independently for a second user", async () => {
    await enqueue(b, 1001);
    await runFixtureWorker();
    const { count } = await b.client.from("media_items").select("id", { count: "exact", head: true });
    expect(count).toBe(35);
    const { count: aCount } = await a.client.from("media_items").select("id", { count: "exact", head: true });
    expect(aCount).toBe(35);
  });

  it("reschedules on long rate limits and resumes from the checkpoint", async () => {
    await admin.from("provider_cache").delete().eq("provider", "jikan");
    const { data: other } = await a.client
      .from("jobs")
      .insert({ kind: "franchise_import", input: { mal_id: 2002, traverse: false }, dedupe_key: "mal:2002" })
      .select("id")
      .single();
    const report = await runFixtureWorker({ failures: { "/anime/2002/episodes": [{ status: 429, retryAfter: "120" }] } });
    expect(report.jobs.find((job) => job.id === other!.id)?.outcome).toBe("rate_limited");

    const { data: waiting } = await admin.from("jobs").select("status, run_after, checkpoint").eq("id", other!.id).single();
    expect(waiting?.status).toBe("queued");
    expect(Date.parse(waiting!.run_after)).toBeGreaterThan(Date.now() + 60_000);
    expect((waiting?.checkpoint as { phase: string }).phase).toBe("episodes");

    await admin.from("jobs").update({ run_after: new Date().toISOString() }).eq("id", other!.id);
    const resumed = await runFixtureWorker();
    expect(resumed.jobs.find((job) => job.id === other!.id)?.outcome).toBe("succeeded");
    const { count } = await a.client.from("media_items").select("id", { count: "exact", head: true }).like("source_key", "mal:2002:%");
    expect(count).toBe(12);
  });

  it("derives aggregate progress atomically from checked episodes", async () => {
    const { data: eps } = await a.client.from("media_items").select("id, parent_id").like("source_key", "mal:1001:episode:%").order("episode_number").limit(3);
    const { data: rows, error } = await a.client.rpc("set_items_checked", { p_item_ids: eps!.map((ep) => ep.id), p_checked: true });
    expect(error).toBeNull();
    const parent = rows?.find((row) => row.media_item_id === eps![0].parent_id);
    expect(parent).toMatchObject({ episodes_watched: 3, status: "watching", episodes_mapped: true });

    const { error: forbidden } = await b.client.rpc("set_items_checked", { p_item_ids: [eps![0].id], p_checked: false });
    expect(forbidden?.code).toBe("22023");
  });

  it("keeps the aggregate exact under concurrent toggles", async () => {
    const { data: eps } = await a.client.from("media_items").select("id, parent_id").like("source_key", "mal:2002:episode:%");
    expect(eps).toHaveLength(12);
    const results = await Promise.all(eps!.map((ep) => a.client.rpc("set_items_checked", { p_item_ids: [ep.id], p_checked: true })));
    expect(results.every((result) => result.error === null)).toBe(true);
    const { data: parent } = await a.client.from("user_progress").select("episodes_watched, status").eq("media_item_id", eps![0].parent_id!).single();
    expect(parent).toEqual({ episodes_watched: 12, status: "completed" });
  });
});
