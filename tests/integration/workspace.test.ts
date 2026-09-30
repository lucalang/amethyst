import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestUser, deleteTestUser, type TestUser } from "../support/local-supabase";

let user: TestUser;
let entry: string;

async function addNode(values: { parent_id?: string | null; kind: "folder" | "note" | "checklist"; name: string; content?: string }) {
  const { data, error } = await user.client
    .from("workspace_nodes")
    .insert({ entry_id: entry, parent_id: values.parent_id ?? null, kind: values.kind, name: values.name, content: values.content ?? "" })
    .select("id, version")
    .single();
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  user = await createTestUser("workspace");
  const { data, error } = await user.client.from("entries").insert({ kind: "anime", title: "One Piece" }).select("id").single();
  if (error) throw error;
  entry = data.id;
});

afterAll(async () => {
  await deleteTestUser(user);
});

describe("workspace structure", () => {
  it("builds nested folders and enforces folder-only parents", async () => {
    const arcs = await addNode({ kind: "folder", name: "Arcs" });
    const eastBlue = await addNode({ parent_id: arcs.id, kind: "folder", name: "East Blue" });
    const note = await addNode({ parent_id: eastBlue.id, kind: "note", name: "Thoughts" });
    const { data: path } = await user.client.from("workspace_nodes").select("name, parent_id").in("id", [arcs.id, eastBlue.id, note.id]);
    expect(path).toHaveLength(3);

    const underNote = await user.client.from("workspace_nodes").insert({ entry_id: entry, parent_id: note.id, kind: "note", name: "child" });
    expect(underNote.error?.code).toBe("23514");
    expect(underNote.error?.message).toMatch(/Only folders/);
  });

  it("rejects moving a folder into itself or its descendants", async () => {
    const outer = await addNode({ kind: "folder", name: "Outer" });
    const inner = await addNode({ parent_id: outer.id, kind: "folder", name: "Inner" });
    const self = await user.client.from("workspace_nodes").update({ parent_id: outer.id }).eq("id", outer.id);
    expect(self.error?.code).toBe("23514");
    const cycle = await user.client.from("workspace_nodes").update({ parent_id: inner.id }).eq("id", outer.id);
    expect(cycle.error?.code).toBe("23514");
    expect(cycle.error?.message).toMatch(/into itself/);
  });

  it("serializes concurrent moves so they cannot create a cycle", async () => {
    const left = await addNode({ kind: "folder", name: "Left" });
    const right = await addNode({ kind: "folder", name: "Right" });
    const results = await Promise.all([
      user.client.from("workspace_nodes").update({ parent_id: right.id }).eq("id", left.id),
      user.client.from("workspace_nodes").update({ parent_id: left.id }).eq("id", right.id),
    ]);
    expect(results.filter((result) => result.error).length).toBe(1);
  });

  it("keeps sibling names unique regardless of case, but allows them in different folders", async () => {
    const folder = await addNode({ kind: "folder", name: "Season 1" });
    await addNode({ kind: "note", name: "Summary" });
    const duplicate = await user.client.from("workspace_nodes").insert({ entry_id: entry, kind: "note", name: "summary" });
    expect(duplicate.error?.code).toBe("23505");
    await addNode({ parent_id: folder.id, kind: "note", name: "Summary" });
    const invalid = await user.client.from("workspace_nodes").insert({ entry_id: entry, kind: "note", name: " padded " });
    expect(invalid.error?.code).toBe("23514");
  });

  it("does not let a node change workspace or type", async () => {
    const note = await addNode({ kind: "note", name: "Typed" });
    const { error } = await user.client.from("workspace_nodes").update({ kind: "folder" } as never).eq("id", note.id);
    expect(error?.code).toBe("42501");
  });

  it("bumps the version only when note content changes", async () => {
    const note = await addNode({ kind: "note", name: "Versioned", content: "v1" });
    const renamed = await user.client.from("workspace_nodes").update({ name: "Versioned note" }).eq("id", note.id).select("version").single();
    expect(renamed.data?.version).toBe(note.version);
    const edited = await user.client.from("workspace_nodes").update({ content: "v2" }).eq("id", note.id).select("version").single();
    expect(edited.data?.version).toBe(note.version + 1);
    const folderContent = await user.client.from("workspace_nodes").insert({ entry_id: entry, kind: "folder", name: "With text", content: "nope" });
    expect(folderContent.error?.code).toBe("23514");
  });

  it("deletes a folder with everything inside it", async () => {
    const folder = await addNode({ kind: "folder", name: "Doomed" });
    const sub = await addNode({ parent_id: folder.id, kind: "folder", name: "Sub" });
    const list = await addNode({ parent_id: sub.id, kind: "checklist", name: "List" });
    await user.client.rpc("add_checklist_items", { p_file_id: list.id, p_labels: ["one", "two"] });
    await user.client.from("workspace_nodes").delete().eq("id", folder.id);
    expect((await user.client.from("workspace_nodes").select("id").in("id", [sub.id, list.id])).data).toEqual([]);
    expect((await user.client.from("workspace_checklist_items").select("id").eq("file_id", list.id)).data).toEqual([]);
  });
});

describe("checklists", () => {
  it("appends, reorders and checks items for arcs that exist nowhere else", async () => {
    const list = await addNode({ kind: "checklist", name: "Arcs to watch" });
    const { data: added, error } = await user.client.rpc("add_checklist_items", {
      p_file_id: list.id,
      p_labels: ["Romance Dawn", "My own filler arc", "Orange Town"],
    });
    expect(error).toBeNull();
    expect(added?.map((item) => [item.label, item.position])).toEqual([
      ["Romance Dawn", 0],
      ["My own filler arc", 1],
      ["Orange Town", 2],
    ]);

    const order = [added![2].id, added![0].id, added![1].id];
    expect((await user.client.rpc("reorder_checklist_items", { p_file_id: list.id, p_item_ids: order })).error).toBeNull();
    const partial = await user.client.rpc("reorder_checklist_items", { p_file_id: list.id, p_item_ids: order.slice(1) });
    expect(partial.error?.code).toBe("22023");

    await user.client.from("workspace_checklist_items").update({ checked: true }).eq("id", added![1].id);
    const { data: tree } = await user.client.from("workspace_tree").select("items_total, items_checked").eq("id", list.id).single();
    expect(tree).toEqual({ items_total: 3, items_checked: 1 });

    expect((await user.client.rpc("set_checklist_checked", { p_file_id: list.id, p_checked: true })).data).toBe(2);
    const { data: items } = await user.client.from("workspace_checklist_items").select("label, checked").eq("file_id", list.id).order("position");
    expect(items).toEqual([
      { label: "Orange Town", checked: true },
      { label: "Romance Dawn", checked: true },
      { label: "My own filler arc", checked: true },
    ]);
  });

  it("gives concurrent appends distinct positions", async () => {
    const list = await addNode({ kind: "checklist", name: "Concurrent" });
    await Promise.all(Array.from({ length: 6 }, (_, index) => user.client.rpc("add_checklist_items", { p_file_id: list.id, p_labels: [`Item ${index}`] })));
    const { data } = await user.client.from("workspace_checklist_items").select("position").eq("file_id", list.id);
    expect(new Set(data?.map((row) => row.position)).size).toBe(6);
  });

  it("only accepts items in checklist files", async () => {
    const note = await addNode({ kind: "note", name: "Not a list" });
    const direct = await user.client.from("workspace_checklist_items").insert({ file_id: note.id, label: "x" });
    expect(direct.error?.code).toBe("23514");
    const rpc = await user.client.rpc("add_checklist_items", { p_file_id: note.id, p_labels: ["x"] });
    expect(rpc.error?.code).toBe("22023");
  });

  it("stores task notes, importance, due dates and ordered steps", async () => {
    const list = await addNode({ kind: "checklist", name: "Watch party" });
    const { data: added } = await user.client.rpc("add_checklist_items", { p_file_id: list.id, p_labels: ["Marineford"] });
    const task = added![0];
    expect(task).toMatchObject({ notes: "", starred: false, due_date: null });

    const updated = await user.client
      .from("workspace_checklist_items")
      .update({ notes: "Bring tissues.\nEpisode 483 onwards.", starred: true, due_date: "2026-11-01" })
      .eq("id", task.id)
      .select("notes, starred, due_date")
      .single();
    expect(updated.data).toEqual({ notes: "Bring tissues.\nEpisode 483 onwards.", starred: true, due_date: "2026-11-01" });

    const steps = [];
    for (const label of ["Snacks", "Projector", "Invite crew"]) {
      const { data, error } = await user.client.rpc("add_checklist_step", { p_item_id: task.id, p_label: label });
      expect(error).toBeNull();
      steps.push(data!);
    }
    expect(steps.map((step) => step.position)).toEqual([0, 1, 2]);
    await user.client.from("workspace_checklist_steps").update({ checked: true }).eq("id", steps[1].id);
    expect((await user.client.rpc("reorder_checklist_steps", { p_item_id: task.id, p_step_ids: [steps[2].id, steps[0].id, steps[1].id] })).error).toBeNull();
    expect((await user.client.rpc("reorder_checklist_steps", { p_item_id: task.id, p_step_ids: [steps[0].id] })).error?.code).toBe("22023");

    const { data: reloaded } = await user.client
      .from("workspace_checklist_items")
      .select("label, steps:workspace_checklist_steps(label, checked, position)")
      .eq("id", task.id)
      .single();
    expect(reloaded?.steps.sort((a, b) => a.position - b.position).map((step) => [step.label, step.checked])).toEqual([
      ["Invite crew", false],
      ["Snacks", false],
      ["Projector", true],
    ]);

    const concurrent = await Promise.all(
      Array.from({ length: 5 }, (_, index) => user.client.rpc("add_checklist_step", { p_item_id: task.id, p_label: `Extra ${index}` })),
    );
    expect(new Set(concurrent.map((result) => result.data?.position)).size).toBe(5);

    await user.client.from("workspace_checklist_items").delete().eq("id", task.id);
    expect((await user.client.from("workspace_checklist_steps").select("id").eq("item_id", task.id)).data).toEqual([]);
  });

  it("summarizes checklist progress per entry", async () => {
    const { data } = await user.client.from("entry_workspace_summary").select("checklist_total, checklist_checked").eq("entry_id", entry).single();
    expect(data?.checklist_total).toBeGreaterThanOrEqual(9);
    expect(data?.checklist_checked).toBeGreaterThanOrEqual(3);
  });

  it("removes the whole workspace with its entry", async () => {
    const { data: temp } = await user.client.from("entries").insert({ kind: "game", title: "Temp" }).select("id").single();
    const { data: file } = await user.client.from("workspace_nodes").insert({ entry_id: temp!.id, kind: "checklist", name: "C" }).select("id").single();
    await user.client.rpc("add_checklist_items", { p_file_id: file!.id, p_labels: ["x"] });
    await user.client.from("entries").delete().eq("id", temp!.id);
    expect((await user.client.from("workspace_nodes").select("id").eq("entry_id", temp!.id)).data).toEqual([]);
    expect((await user.client.from("workspace_checklist_items").select("id").eq("file_id", file!.id)).data).toEqual([]);
  });
});
