import { expect, test } from "@playwright/test";
import { adminClient } from "../support/local-supabase";
import { E2E_USERS, signIn } from "./helpers";

const NIL = "00000000-0000-4000-8000-000000000000";

test.describe("access control", () => {
  test("anonymous visitors are redirected and API calls are rejected", async ({ page, request }) => {
    await page.goto(`/entries/${NIL}`);
    await expect(page).toHaveURL(/\/login\?next=/);
    for (const path of [`/api/entries/${NIL}/nodes`, `/api/nodes/${NIL}`]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(401);
      expect(response.headers()["cache-control"]).toContain("no-store");
    }
    const post = await request.post(`/api/entries/${NIL}/nodes`, {
      headers: { Origin: "http://localhost:3100" },
      data: { parentId: null, kind: "note", name: "x" },
    });
    expect(post.status()).toBe(401);
  });

  test("cross-site and cross-user requests cannot read or mutate another workspace", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "one run is enough");
    const admin = adminClient();
    const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const victim = users.users.find((user) => user.email === E2E_USERS.desktop.email)!;
    const { data: entry } = await admin.from("entries").select("id").eq("user_id", victim.id).limit(1).single();
    const { data: checklist } = await admin.from("workspace_nodes").select("id").eq("user_id", victim.id).eq("kind", "checklist").limit(1).single();
    const { data: item } = await admin.from("workspace_checklist_items").select("id").eq("user_id", victim.id).limit(1).single();
    expect(entry && checklist && item).toBeTruthy();

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
    expect((await api.patch(`/api/items/${item!.id}`, { headers: origin, data: { checked: true } })).status()).toBe(404);
    expect((await api.delete(`/api/items/${item!.id}`, { headers: origin })).status()).toBe(404);
    expect((await api.patch(`/api/entries/${entry!.id}`, { headers: origin, data: { title: "pwned" } })).status()).toBe(404);
    expect((await api.delete(`/api/entries/${entry!.id}`, { headers: origin })).status()).toBe(404);
    await page.goto(`/entries/${entry!.id}`);
    await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();

    // Missing or foreign Origin headers are refused for state-changing requests.
    expect((await api.post(`/api/entries/${entry!.id}/nodes`, { headers: { Origin: "https://evil.example" }, data: {} })).status()).toBe(403);
    const { data: still } = await admin.from("workspace_checklist_items").select("checked").eq("id", item!.id).single();
    expect(still).toBeTruthy();
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
    // Old franchise links land on the workspace route.
    await page.goto(`/franchise/${NIL}`);
    await expect(page).toHaveURL(new RegExp(`/entries/${NIL}$`));
  });
});
