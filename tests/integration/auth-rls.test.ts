import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, createTestUser, deleteTestUser, type TestUser } from "../support/local-supabase";

let a: TestUser;
let b: TestUser;
let aEntry: string;
let aFile: string;
let bEntry: string;
let bFolder: string;
let bFile: string;
let bItem: string;
let bStep: string;

async function makeWorkspace(user: TestUser, label: string) {
  const { data: entry, error } = await user.client.from("entries").insert({ kind: "anime", title: `${label} anime` }).select("id").single();
  if (error) throw error;
  const { data: folder, error: folderError } = await user.client
    .from("workspace_nodes")
    .insert({ entry_id: entry.id, kind: "folder", name: "Arcs" })
    .select("id")
    .single();
  if (folderError) throw folderError;
  const { data: file, error: fileError } = await user.client
    .from("workspace_nodes")
    .insert({ entry_id: entry.id, parent_id: folder.id, kind: "checklist", name: "East Blue" })
    .select("id")
    .single();
  if (fileError) throw fileError;
  const { data: items, error: itemError } = await user.client.rpc("add_checklist_items", { p_file_id: file.id, p_labels: [`${label} secret item`] });
  if (itemError) throw itemError;
  const { data: step, error: stepError } = await user.client.rpc("add_checklist_step", { p_item_id: items[0].id, p_label: `${label} secret step` });
  if (stepError) throw stepError;
  return { entry: entry.id, folder: folder.id, file: file.id, item: items[0].id, step: step.id };
}

beforeAll(async () => {
  a = await createTestUser("rls-a");
  b = await createTestUser("rls-b");
  ({ entry: aEntry, file: aFile } = await makeWorkspace(a, "a"));
  ({ entry: bEntry, folder: bFolder, file: bFile, item: bItem, step: bStep } = await makeWorkspace(b, "b"));
});

afterAll(async () => {
  await deleteTestUser(a);
  await deleteTestUser(b);
});

describe("public registration", () => {
  it("creates unconfirmed accounts that cannot sign in until the email is verified", async () => {
    const email = `signup-${Date.now()}@example.com`;
    const { data, error } = await anonClient().auth.signUp({ email, password: "Password-12345" });
    try {
      expect(error).toBeNull();
      expect(data.user?.email).toBe(email);
      expect(data.session).toBeNull();
      const login = await anonClient().auth.signInWithPassword({ email, password: "Password-12345" });
      expect(login.error?.code).toBe("email_not_confirmed");
      expect(login.data.session).toBeNull();
    } finally {
      if (data.user) await adminClient().auth.admin.deleteUser(data.user.id);
    }
  });

  it("does not create accounts from magic-link requests", async () => {
    const email = `magic-${Date.now()}@test.local`;
    await anonClient().auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    const { data } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
    expect(data.users.some((user) => user.email === email)).toBe(false);
  });
});

describe("direct Data API access (PostgREST) respects ownership", () => {
  it("anonymous requests cannot read or write workspaces", async () => {
    const anon = anonClient();
    for (const table of ["entries", "workspace_nodes", "workspace_checklist_items", "workspace_checklist_steps"] as const) {
      const read = await anon.from(table).select("id");
      expect(read.error?.code ?? (read.data?.length === 0 ? "empty" : "leak")).not.toBe("leak");
    }
    const write = await anon.from("workspace_nodes").insert({ entry_id: bEntry, kind: "note", name: "anon" });
    expect(write.error).not.toBeNull();
    const rpc = await anon.rpc("set_checklist_checked", { p_file_id: bFile, p_checked: true });
    expect(rpc.error).not.toBeNull();
  });

  it("users only see their own entries, files and items", async () => {
    const { data: entries } = await a.client.from("entries").select("id");
    expect(entries?.map((row) => row.id)).toEqual([aEntry]);
    const { data: nodes } = await a.client.from("workspace_nodes").select("id, entry_id");
    expect(nodes?.every((row) => row.entry_id === aEntry)).toBe(true);
    expect((await a.client.from("workspace_checklist_items").select("id").eq("id", bItem)).data).toEqual([]);
    expect((await a.client.from("workspace_tree").select("id").eq("entry_id", bEntry)).data).toEqual([]);
    expect((await a.client.from("entry_workspace_summary").select("entry_id").eq("entry_id", bEntry)).data).toEqual([]);
  });

  it("cannot change or delete another user's workspace", async () => {
    expect((await a.client.from("workspace_nodes").update({ name: "pwned" }).eq("id", bFile).select("id")).data).toEqual([]);
    expect((await a.client.from("workspace_nodes").delete().eq("id", bFolder).select("id")).data).toEqual([]);
    expect((await a.client.from("workspace_checklist_items").update({ checked: true }).eq("id", bItem).select("id")).data).toEqual([]);
    expect((await a.client.from("workspace_checklist_items").delete().eq("id", bItem).select("id")).data).toEqual([]);
    const { data: still } = await b.client.from("workspace_checklist_items").select("label, checked").eq("id", bItem).single();
    expect(still).toEqual({ label: "b secret item", checked: false });
  });

  it("keeps task details and steps private", async () => {
    expect((await a.client.from("workspace_checklist_steps").select("id").eq("id", bStep)).data).toEqual([]);
    expect((await a.client.from("workspace_checklist_steps").update({ checked: true }).eq("id", bStep).select("id")).data).toEqual([]);
    expect((await a.client.from("workspace_checklist_steps").delete().eq("id", bStep).select("id")).data).toEqual([]);
    expect((await a.client.from("workspace_checklist_items").update({ notes: "pwned", starred: true }).eq("id", bItem).select("id")).data).toEqual([]);
    expect((await a.client.rpc("add_checklist_step", { p_item_id: bItem, p_label: "planted" })).error?.code).toBe("22023");
    expect((await a.client.rpc("reorder_checklist_steps", { p_item_id: bItem, p_step_ids: [bStep] })).error?.code).toBe("22023");
    expect((await a.client.from("workspace_checklist_steps").insert({ item_id: bItem, label: "planted" })).error?.code).toBe("23503");
    const { data: item } = await b.client
      .from("workspace_checklist_items")
      .select("notes, starred, steps:workspace_checklist_steps(label, checked)")
      .eq("id", bItem)
      .single();
    expect(item).toEqual({ notes: "", starred: false, steps: [{ label: "b secret step", checked: false }] });
  });

  it("cannot attach files or items to another user's workspace", async () => {
    const intoEntry = await a.client.from("workspace_nodes").insert({ entry_id: bEntry, kind: "note", name: "planted" });
    expect(intoEntry.error?.code).toBe("23503");
    const intoFolder = await a.client.from("workspace_nodes").insert({ entry_id: aEntry, parent_id: bFolder, kind: "note", name: "planted" });
    expect(intoFolder.error?.code).toBe("23503");
    const moveInto = await a.client.from("workspace_nodes").update({ parent_id: bFolder }).eq("id", aFile);
    expect(moveInto.error?.code).toBe("23503");
    const item = await a.client.from("workspace_checklist_items").insert({ file_id: bFile, label: "planted" });
    expect(item.error?.code).toBe("23503");
    for (const rpc of [
      a.client.rpc("add_checklist_items", { p_file_id: bFile, p_labels: ["planted"] }),
      a.client.rpc("set_checklist_checked", { p_file_id: bFile, p_checked: true }),
      a.client.rpc("reorder_checklist_items", { p_file_id: bFile, p_item_ids: [bItem] }),
    ]) {
      expect((await rpc).error?.code).toBe("22023");
    }
  });

  it("cannot forge ownership, versions or timestamps", async () => {
    const forged = await a.client.from("entries").insert({ kind: "custom", title: "forged", user_id: b.id });
    expect(forged.error?.code).toBe("42501");
    const forgedNode = await a.client.from("workspace_nodes").insert({ entry_id: aEntry, kind: "note", name: "forged", user_id: b.id });
    expect(forgedNode.error?.code).toBe("42501");
    const version = await a.client.from("workspace_nodes").update({ version: 99 }).eq("id", aFile);
    expect(version.error?.code).toBe("42501");
    const moveItem = await a.client.from("workspace_checklist_items").update({ file_id: bFile }).eq("file_id", aFile);
    expect(moveItem.error?.code).toBe("42501");
  });

  it("no longer exposes the removed MyAnimeList and worker surface", async () => {
    for (const table of ["mal_credentials", "mal_accounts", "sync_outbox", "jobs", "media_items", "user_progress"]) {
      const { error } = await a.client.from(table as "entries").select("*").limit(1);
      expect(error?.code, table).toBe("PGRST205");
    }
    for (const fn of ["claim_jobs", "set_items_checked", "approve_initial_sync"]) {
      const { error } = await a.client.rpc(fn as "set_checklist_checked", {} as never);
      expect(error?.code, fn).toBe("PGRST202");
    }
  });
});
