import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, createTestUser, deleteTestUser, type TestUser } from "../support/local-supabase";

let a: TestUser;
let b: TestUser;
let aEntry: string;
let aItem: string;
let bEntry: string;
let bItem: string;

beforeAll(async () => {
  a = await createTestUser("rls-a");
  b = await createTestUser("rls-b");
  const makeData = async (user: TestUser, label: string) => {
    const { data: entry, error } = await user.client.from("entries").insert({ kind: "custom", title: `${label} entry` }).select("id").single();
    if (error) throw error;
    const { data: item, error: itemError } = await user.client
      .from("media_items")
      .insert({ kind: "checklist", title: `${label} item`, source_key: `custom:${label}` })
      .select("id")
      .single();
    if (itemError) throw itemError;
    return { entry: entry.id, item: item.id };
  };
  ({ entry: aEntry, item: aItem } = await makeData(a, "a"));
  ({ entry: bEntry, item: bItem } = await makeData(b, "b"));
});

afterAll(async () => {
  await deleteTestUser(a);
  await deleteTestUser(b);
});

describe("invite-only authentication", () => {
  it("rejects public sign-up", async () => {
    const { data, error } = await anonClient().auth.signUp({ email: `intruder-${Date.now()}@test.local`, password: "Password-12345" });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });

  it("does not create accounts from magic-link requests", async () => {
    const email = `magic-${Date.now()}@test.local`;
    await anonClient().auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    const { data } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
    expect(data.users.some((user) => user.email === email)).toBe(false);
  });
});

describe("direct Data API access (PostgREST) respects ownership", () => {
  it("anonymous requests cannot read or write the vault", async () => {
    const anon = anonClient();
    const read = await anon.from("entries").select("id");
    expect(read.error?.code ?? (read.data?.length === 0 ? "empty" : "leak")).not.toBe("leak");
    const write = await anon.from("entries").insert({ kind: "custom", title: "anon" });
    expect(write.error).not.toBeNull();
    const rpc = await anon.rpc("set_items_checked", { p_item_ids: [aItem], p_checked: true });
    expect(rpc.error).not.toBeNull();
  });

  it("users only see their own rows", async () => {
    const { data } = await a.client.from("entries").select("id");
    expect(data?.map((row) => row.id)).toEqual([aEntry]);
    const { data: other } = await a.client.from("media_items").select("id").eq("id", bItem);
    expect(other).toEqual([]);
  });

  it("cannot mutate another user's rows", async () => {
    const update = await a.client.from("entries").update({ title: "pwned" }).eq("id", bEntry).select("id");
    expect(update.data).toEqual([]);
    const remove = await a.client.from("media_items").delete().eq("id", bItem).select("id");
    expect(remove.data).toEqual([]);
    const { data: still } = await b.client.from("entries").select("title").eq("id", bEntry).single();
    expect(still?.title).toBe("b entry");
  });

  it("cannot forge ownership or reference foreign rows", async () => {
    const forged = await a.client.from("entries").insert({ kind: "custom", title: "forged", user_id: b.id });
    expect(forged.error?.code).toBe("42501");
    const link = await a.client.from("entry_media_items").insert({ entry_id: aEntry, media_item_id: bItem });
    expect(link.error?.code).toBe("23503");
    const progress = await a.client.from("user_progress").insert({ media_item_id: bItem, is_checked: true });
    expect(progress.error?.code).toBe("23503");
    const tabs = await a.client.from("custom_games").insert({ entry_id: bEntry });
    expect(tabs.error?.code).toBe("23503");
  });

  it("cannot read server-only secrets or call worker functions", async () => {
    const creds = await a.client.from("mal_credentials").select("*");
    expect(creds.error?.code).toBe("42501");
    const states = await a.client.from("oauth_states").select("*");
    expect(states.error?.code).toBe("42501");
    const claim = await a.client.rpc("claim_jobs", { p_worker: "x", p_limit: 5, p_lease_seconds: 10 });
    expect(claim.error?.code).toBe("42501");
  });
});
