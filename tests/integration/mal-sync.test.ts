import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importEncryptionKey } from "@/lib/sync/crypto";
import { storeTokens } from "@/lib/sync/tokens";
import { runWorker, type WorkerConfig } from "@/lib/worker/run";
import { createFixtureFetch } from "../support/jikan-fixtures";
import { createMalMock } from "../support/mal-mock";
import { adminClient, createTestUser, deleteTestUser, setScheduledWorker, type TestUser } from "../support/local-supabase";

const admin = adminClient();
const JIKAN = "http://jikan.test/v4";
const KEY = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const mal = createMalMock();
const jikan = createFixtureFetch(JIKAN);

const routedFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return new URL(url).host === "mal.test" ? mal.fetch(input, init) : jikan.fetch(input as string);
}) as typeof fetch;

const config: WorkerConfig = {
  workerId: "sync-test",
  budgetMs: 40_000,
  jikanBaseUrl: JIKAN,
  jikanIntervalMs: 0,
  malIntervalMs: 0,
  mal: { clientId: "test-client", tokenUrl: mal.endpoints.tokenUrl, apiBaseUrl: mal.endpoints.apiBaseUrl },
  encryptionKey: KEY,
};

const work = () => runWorker(admin, config, { fetch: routedFetch, sleep: async () => undefined, now: Date.now });
const due = () => admin.from("sync_outbox").update({ not_before: new Date(Date.now() - 1000).toISOString() }).eq("state", "pending");

let user: TestUser;
let series: string;

async function progressOf(id: string) {
  const { data } = await user.client.from("user_progress").select("*").eq("media_item_id", id).maybeSingle();
  return data;
}

beforeAll(async () => {
  await setScheduledWorker(false);
  await admin.from("jobs").update({ status: "cancelled" }).in("status", ["queued", "running"]);
  await admin.from("sync_outbox").update({ state: "superseded" }).in("state", ["pending", "in_flight"]);
  await admin.from("provider_cache").delete().eq("provider", "jikan");
  user = await createTestUser("sync");

  await user.client.from("jobs").insert({ kind: "franchise_import", input: { mal_id: 1001, traverse: true }, dedupe_key: "mal:1001" });
  await work();
  const { data } = await user.client.from("media_items").select("id").eq("mal_id", 1001).single();
  series = data!.id;

  // Simulate a completed OAuth connection (the HTTP flow is covered by E2E).
  await storeTokens(admin, await importEncryptionKey(KEY), user.id, { accessToken: "access-1", refreshToken: "refresh-1", expiresAt: new Date(Date.now() + 3600_000) });
  await admin.from("mal_accounts").insert({ user_id: user.id, mal_user_id: 4242, mal_username: "mock_mal_user" });
  mal.setEntry(1001, "Fixture Saga", "watching", 7, 5);
  mal.setEntry(1004, "Fixture Saga: The Movie", "completed", 9, 1);
  mal.setEntry(9999, "Not In Archive", "plan_to_watch", 0, 0);
});

afterAll(async () => {
  await deleteTestUser(user);
  await setScheduledWorker(true);
});

describe("MyAnimeList synchronization (worker + database + mock MAL)", () => {
  it("stores tokens encrypted and unreadable by the user", async () => {
    const { data } = await admin.from("mal_credentials").select("access_token_ciphertext").eq("user_id", user.id).single();
    expect(data!.access_token_ciphertext).not.toContain("access-1");
    const denied = await user.client.from("mal_credentials").select("*");
    expect(denied.error?.code).toBe("42501");
  });

  it("pulls the complete list for preview without changing local progress", async () => {
    await user.client.from("jobs").insert({ kind: "mal_pull", input: { reason: "connect" }, dedupe_key: "mal_pull" });
    await work();
    const { data: account } = await user.client.from("mal_accounts").select("initial_sync, outbound_enabled").single();
    expect(account).toEqual({ initial_sync: "ready", outbound_enabled: false });
    const { count } = await user.client.from("mal_list_entries").select("mal_id", { count: "exact", head: true });
    expect(count).toBe(3);
    expect(await progressOf(series)).toBeNull();
    expect(mal.state.patches).toHaveLength(0);
  });

  it("applies approved MAL counts as unmapped aggregates", async () => {
    const { error } = await user.client.rpc("approve_initial_sync", { p_apply_remote: [1001, 1004], p_enable_outbound: true });
    expect(error).toBeNull();
    expect(await progressOf(series)).toMatchObject({ episodes_watched: 5, episodes_mapped: false, status: "watching", score: 7 });
    const { count } = await user.client.from("user_progress").select("media_item_id", { count: "exact", head: true }).eq("is_checked", true);
    expect(count).toBe(0);
    await work();
    expect(mal.state.patches).toHaveLength(0); // nothing to push: local equals remote
  });

  it("pushes local changes through the debounced outbox", async () => {
    const { data: eps } = await user.client.from("media_items").select("id").eq("parent_id", series).order("episode_number").limit(6);
    await user.client.rpc("set_items_checked", { p_item_ids: eps!.map((ep) => ep.id), p_checked: true });
    expect(await progressOf(series)).toMatchObject({ episodes_watched: 6, episodes_mapped: true });

    const { data: pending } = await user.client.from("sync_outbox").select("state, desired").eq("media_item_id", series).eq("state", "pending").single();
    expect(pending?.desired).toMatchObject({ num_watched_episodes: 6 });

    await due();
    const report = await work();
    expect(report.outbox.map((row) => row.outcome)).toContain("synced");
    expect(mal.state.patches.at(-1)).toMatchObject({ id: 1001, body: { num_watched_episodes: "6", status: "watching", score: "7" } });
    const { data: baseline } = await admin.from("sync_baselines").select("episodes_watched").eq("media_item_id", series).single();
    expect(baseline?.episodes_watched).toBe(6);
  });

  it("detects simultaneous edits as a conflict instead of overwriting", async () => {
    mal.setEntry(1001, "Fixture Saga", "watching", 7, 9); // changed on MAL
    const { data: ep7 } = await user.client.from("media_items").select("id").eq("parent_id", series).eq("episode_number", 7).single();
    await user.client.rpc("set_items_checked", { p_item_ids: [ep7!.id], p_checked: true });
    await due();
    const patchesBefore = mal.state.patches.length;
    const report = await work();
    expect(report.outbox.map((row) => row.outcome)).toContain("conflict");
    expect(mal.state.patches.length).toBe(patchesBefore);
    const { data: conflicts } = await user.client.from("sync_conflicts").select("id, local, remote").eq("state", "open");
    expect(conflicts).toHaveLength(1);
    expect(conflicts![0].local).toMatchObject({ num_watched_episodes: 7 });
    expect(conflicts![0].remote).toMatchObject({ num_watched_episodes: 9 });

    const { error } = await user.client.rpc("resolve_sync_conflict", { p_conflict_id: conflicts![0].id, p_choice: "remote" });
    expect(error).toBeNull();
    expect(await progressOf(series)).toMatchObject({ episodes_watched: 9, episodes_mapped: false });
  });

  it("applies remote-only changes on refresh", async () => {
    mal.setEntry(1004, "Fixture Saga: The Movie", "completed", 10, 1);
    await user.client.from("jobs").insert({ kind: "mal_pull", input: { reason: "manual" }, dedupe_key: "mal_pull" });
    await work();
    const { data: movie } = await user.client.from("media_items").select("id").eq("mal_id", 1004).single();
    expect(await progressOf(movie!.id)).toMatchObject({ score: 10, status: "completed" });
  });

  it("refreshes expired access tokens transparently", async () => {
    await admin.from("mal_credentials").update({ access_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("user_id", user.id);
    await user.client.rpc("set_container_progress", { p_item_id: series, p_score: 8 });
    await due();
    const report = await work();
    expect(report.outbox.map((row) => row.outcome)).toContain("synced");
    expect(mal.state.tokenRequests.at(-1)).toMatchObject({ grant_type: "refresh_token", refresh_token: "refresh-1", client_id: "test-client" });
  });

  it("requires reconnect when the refresh token is rejected, keeping local progress usable", async () => {
    mal.state.refreshFails = true;
    await admin.from("mal_credentials").update({ access_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("user_id", user.id);
    const { error } = await user.client.rpc("set_container_progress", { p_item_id: series, p_status: "on_hold" });
    expect(error).toBeNull();
    await due();
    await work();
    const { data: account } = await user.client.from("mal_accounts").select("status").single();
    expect(account?.status).toBe("reconnect_required");
    const { data: pending } = await user.client.from("sync_outbox").select("state").eq("media_item_id", series).eq("state", "pending");
    expect(pending).toHaveLength(1);
    expect((await progressOf(series))?.status).toBe("on_hold");
  });
});
