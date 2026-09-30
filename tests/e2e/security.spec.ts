import { expect, test } from "@playwright/test";
import { adminClient } from "../support/local-supabase";
import { E2E_USERS, signIn } from "./helpers";

const NIL = "00000000-0000-4000-8000-000000000000";

test.describe("access control", () => {
  test("anonymous visitors are redirected and API calls are rejected", async ({ page, request }) => {
    for (const path of ["/anime", "/games", `/anime/${NIL}`, "/settings"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login\?next=/);
    }
    for (const path of [`/api/entries/${NIL}/nodes`, `/api/nodes/${NIL}`, `/api/image?url=${encodeURIComponent("https://placehold.co/10.png")}`]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(401);
      expect(response.headers()["cache-control"]).toContain("no-store");
    }
    const post = await request.post(`/api/items/${NIL}/steps`, { headers: { Origin: "http://localhost:3100" }, data: { label: "x" } });
    expect(post.status()).toBe(401);
  });

  test("cross-site and cross-user requests cannot read or mutate another workspace", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "one run is enough");
    const admin = adminClient();
    const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const victim = users.users.find((user) => user.email === E2E_USERS.desktop.email)!;
    // Self-contained fixtures for the victim's workspace (the profile row normally appears at first sign-in).
    expect((await admin.from("users").upsert({ id: victim.id })).error).toBeNull();
    const { data: entry } = await admin.from("entries").insert({ user_id: victim.id, kind: "anime", title: "Victim anime" }).select("id, kind").single();
    const { data: checklist } = await admin
      .from("workspace_nodes")
      .insert({ user_id: victim.id, entry_id: entry!.id, kind: "checklist", name: "Victim list" })
      .select("id")
      .single();
    const { data: item } = await admin.from("workspace_checklist_items").insert({ user_id: victim.id, file_id: checklist!.id, label: "Victim task" }).select("id").single();
    const { data: step } = await admin.from("workspace_checklist_steps").insert({ user_id: victim.id, item_id: item!.id, label: "victim step" }).select("id").single();
    expect(entry && checklist && item && step).toBeTruthy();

    await signIn(page, E2E_USERS.intruder.email, E2E_USERS.intruder.password);
    const api = page.request;
    const origin = { Origin: "http://localhost:3100" };

    expect((await api.get(`/api/entries/${entry!.id}/nodes`)).status()).toBe(404);
    expect((await api.get(`/api/nodes/${checklist!.id}`)).status()).toBe(404);
    expect((await api.patch(`/api/nodes/${checklist!.id}`, { headers: origin, data: { name: "pwned" } })).status()).toBe(404);
    expect((await api.delete(`/api/nodes/${checklist!.id}`, { headers: origin })).status()).toBe(404);
    expect((await api.post(`/api/entries/${entry!.id}/nodes`, { headers: origin, data: { parentId: null, kind: "note", name: "planted" } })).status()).toBe(404);
    expect((await api.post(`/api/nodes/${checklist!.id}/items`, { headers: origin, data: { labels: ["planted"] } })).status()).toBe(422);
    expect((await api.patch(`/api/nodes/${checklist!.id}/items`, { headers: origin, data: { checked: true } })).status()).toBe(422);
    expect((await api.patch(`/api/items/${item!.id}`, { headers: origin, data: { checked: true, notes: "pwned", starred: true } })).status()).toBe(404);
    expect((await api.delete(`/api/items/${item!.id}`, { headers: origin })).status()).toBe(404);
    expect((await api.post(`/api/items/${item!.id}/steps`, { headers: origin, data: { label: "planted" } })).status()).toBe(422);
    expect((await api.put(`/api/items/${item!.id}/steps`, { headers: origin, data: { stepIds: [step!.id] } })).status()).toBe(422);
    expect((await api.patch(`/api/steps/${step!.id}`, { headers: origin, data: { checked: true } })).status()).toBe(404);
    expect((await api.delete(`/api/steps/${step!.id}`, { headers: origin })).status()).toBe(404);
    expect((await api.patch(`/api/entries/${entry!.id}`, { headers: origin, data: { title: "pwned" } })).status()).toBe(404);
    expect((await api.delete(`/api/entries/${entry!.id}`, { headers: origin })).status()).toBe(404);
    await page.goto(`/anime/${entry!.id}`);
    await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();

    // Missing or foreign Origin headers are refused for state-changing requests.
    expect((await api.post(`/api/entries/${entry!.id}/nodes`, { headers: { Origin: "https://evil.example" }, data: {} })).status()).toBe(403);
    expect((await api.patch(`/api/items/${item!.id}`, { headers: { Origin: "https://evil.example" }, data: { starred: true } })).status()).toBe(403);

    const { data: still } = await admin.from("workspace_checklist_items").select("notes, starred").eq("id", item!.id).single();
    expect(still?.notes).not.toBe("pwned");
    const { data: stepStill } = await admin.from("workspace_checklist_steps").select("checked").eq("id", step!.id).single();
    expect(stepStill).toEqual({ checked: false });
    await admin.from("entries").delete().eq("id", entry!.id);
  });

  test("the image proxy only fetches public images", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "one run is enough");
    await signIn(page, E2E_USERS.intruder.email, E2E_USERS.intruder.password);
    const check = async (url: string) => {
      const response = await page.request.get(`/api/image?mode=check&url=${encodeURIComponent(url)}`);
      expect(response.status()).toBe(200);
      return (await response.json()) as { ok: boolean; code?: string; contentType?: string };
    };

    for (const url of ["http://127.0.0.1:54321/rest/v1/", "http://localhost:3100/api/image", "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://10.0.0.1/x.png"]) {
      expect(await check(url), url).toMatchObject({ ok: false, code: expect.stringMatching(/private_address|invalid_url/) });
    }
    // A public redirector that points at a private address is refused at the hop.
    expect(await check("https://httpbin.org/redirect-to?url=http://127.0.0.1/a.png")).toMatchObject({ ok: false, code: "private_address" });
    expect(await check("https://example.com/")).toMatchObject({ ok: false, code: "not_an_image" });
    expect(await check("https://placehold.co/40x60/png")).toMatchObject({ ok: true, contentType: "image/png" });

    const image = await page.request.get(`/api/image?url=${encodeURIComponent("https://placehold.co/40x60/png")}`);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");
    expect(image.headers()["x-content-type-options"]).toBe("nosniff");
    expect(image.headers()["content-security-policy"]).toContain("sandbox");
    const blocked = await page.request.get(`/api/image?url=${encodeURIComponent("http://127.0.0.1:54321/")}`);
    expect(blocked.status()).toBe(400);
  });

  test("MyAnimeList import and sync are gone", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "one run is enough");
    await signIn(page, E2E_USERS.intruder.email, E2E_USERS.intruder.password);
    for (const path of ["/sync", "/import"]) {
      expect((await page.goto(path))?.status(), path).toBe(404);
    }
    for (const path of ["/api/sync/status", "/api/imports", "/api/mal/connect", `/api/catalog/search?q=x`, `/api/entries/${NIL}/progress`]) {
      expect((await page.request.get(path)).status(), path).toBe(404);
    }
  });
});
