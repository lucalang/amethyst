import { expect, test } from "@playwright/test";
import { adminClient } from "../support/local-supabase";
import { E2E_USERS, signIn } from "./helpers";

test.describe("access control", () => {
  test("anonymous visitors are redirected and API calls are rejected", async ({ page, request }) => {
    await page.goto("/franchise/00000000-0000-4000-8000-000000000000");
    await expect(page).toHaveURL(/\/login\?next=/);
    for (const path of ["/api/imports", "/api/sync/status", "/api/entries/00000000-0000-4000-8000-000000000000/progress", "/api/catalog/search?q=x"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(401);
      expect(response.headers()["cache-control"]).toContain("no-store");
    }
    const post = await request.post("/api/progress/check", {
      headers: { Origin: "http://localhost:3100" },
      data: { itemIds: ["00000000-0000-4000-8000-000000000000"], checked: true },
    });
    expect(post.status()).toBe(401);
  });

  test("cross-site and cross-user requests cannot read or mutate another vault", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "one run is enough");
    const admin = adminClient();
    const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const victim = users.users.find((user) => user.email === E2E_USERS.desktop.email)!;
    const { data: victimJob } = await admin.from("jobs").select("id").eq("user_id", victim.id).limit(1).maybeSingle();
    const { data: victimEntry } = await admin.from("entries").select("id").eq("user_id", victim.id).limit(1).maybeSingle();
    const { data: victimItem } = await admin.from("media_items").select("id").eq("user_id", victim.id).eq("kind", "episode").limit(1).maybeSingle();

    await signIn(page, E2E_USERS.intruder.email, E2E_USERS.intruder.password);
    const api = page.request;
    const origin = { Origin: "http://localhost:3100" };

    if (victimJob) expect((await api.get(`/api/imports/${victimJob.id}`)).status()).toBe(404);
    if (victimEntry) {
      const progress = await api.get(`/api/entries/${victimEntry.id}/progress`);
      expect((await progress.json()).rows).toEqual([]);
      expect((await api.patch(`/api/entries/${victimEntry.id}`, { headers: origin, data: { title: "pwned" } })).status()).toBe(404);
      expect((await api.delete(`/api/entries/${victimEntry.id}`, { headers: origin })).status()).toBe(404);
      await page.goto(`/franchise/${victimEntry.id}`);
      await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
    }
    if (victimItem) {
      const check = await api.post("/api/progress/check", { headers: origin, data: { itemIds: [victimItem.id], checked: true } });
      expect(check.status()).toBe(422);
    }
    // Missing or foreign Origin headers are refused for state-changing requests.
    expect((await api.post("/api/imports", { headers: { Origin: "https://evil.example" }, data: { malId: 1 } })).status()).toBe(403);
  });
});
