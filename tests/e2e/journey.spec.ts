import { expect, test } from "@playwright/test";
import { E2E_USERS, assertLayoutAndA11y, makeOutboxDue, mockState, resetMalMock, runE2EWorker, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

test("import → franchise → progress → custom game → MAL sync", async ({ page }, testInfo) => {
  const user = testInfo.project.name === "mobile" ? E2E_USERS.mobile : E2E_USERS.desktop;
  const shot = (name: string) => page.screenshot({ path: `tests/e2e/screenshots/${testInfo.project.name}-${name}.png`, fullPage: true });

  await signIn(page, user.email, user.password);
  await expect(page.getByRole("heading", { name: "Your archive is empty" })).toBeVisible();
  await assertLayoutAndA11y(page);

  // --- Import by title search -------------------------------------------------
  await page.goto("/import");
  await page.getByLabel("Title, MyAnimeList ID or URL").fill("Fixture Saga");
  await page.getByRole("button", { name: "Search" }).click();
  const result = page.getByRole("listitem").filter({ hasText: "MAL #1001" });
  await expect(result).toBeVisible();
  await result.getByRole("button", { name: "Import franchise" }).click();
  await expect(page.getByText("Import queued")).toBeVisible();

  const report = await runE2EWorker();
  expect(report.jobs.some((job) => job.outcome === "succeeded")).toBe(true);
  const jobCard = page.getByRole("listitem").filter({ hasText: "Fixture Saga" }).filter({ hasText: "succeeded" });
  await expect(jobCard).toBeVisible({ timeout: 15_000 });
  await jobCard.getByRole("link", { name: "Open" }).click();

  // --- Franchise page ---------------------------------------------------------
  await expect(page.getByRole("heading", { level: 1, name: "Fixture Saga" })).toBeVisible();
  for (const tab of ["Arcs", "Movies", "OVAs & Specials", "Characters"]) {
    await expect(page.getByRole("tab", { name: new RegExp(tab) })).toBeVisible();
  }
  await expect(page.getByText("0/1 movies watched").first()).toBeVisible();
  await expect(page.getByText(/unknown/).first()).toBeVisible(); // Season 2 total is unknown
  await shot("franchise");
  await assertLayoutAndA11y(page);

  // Episodes in the Arcs tab
  await page.getByRole("checkbox", { name: /Episode title 1$/ }).first().click();
  await page.getByRole("checkbox", { name: /Episode title 2$/ }).first().click();
  const seriesMeter = page.getByRole("progressbar", { name: "episodes progress" }).first();
  await expect(seriesMeter).toHaveAttribute("aria-valuetext", "2 of 26 episodes");

  // Curated arc acting on its member episodes
  await page.getByRole("button", { name: "Add arc to Fixture Saga", exact: true }).click();
  await page.getByLabel("Arc title").fill("Opening arc");
  await page.getByLabel("First episode").fill("1");
  await page.getByLabel("Last episode").fill("5");
  await page.getByRole("button", { name: "Create arc" }).click();
  await expect(page.getByText("Opening arc")).toBeVisible();
  await page.getByRole("checkbox", { name: "Check every episode in Opening arc" }).click();
  await expect(seriesMeter).toHaveAttribute("aria-valuetext", "5 of 26 episodes");

  // Movies tab
  await page.getByRole("tab", { name: /Movies/ }).click();
  await page.getByRole("checkbox", { name: /Fixture Saga: The Movie/ }).click();
  await expect(page.getByText("1/1 movies watched").first()).toBeVisible();

  // Characters tab
  await page.getByRole("tab", { name: /Characters/ }).click();
  await expect(page.getByText("Protagonist, Test")).toBeVisible();

  // Reload: progress is persisted server-side
  await page.reload();
  await expect(page.getByRole("tab", { name: /Characters/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("1/1 movies watched").first()).toBeVisible();
  await page.getByRole("tab", { name: "Arcs" }).click();
  await expect(page.getByRole("progressbar", { name: "episodes progress" }).first()).toHaveAttribute("aria-valuetext", "5 of 26 episodes");
  await expect(page.getByRole("checkbox", { name: /Episode title 2$/ }).first()).toHaveAttribute("data-state", "checked");

  // --- Custom game --------------------------------------------------------------
  await page.goto("/entries/new?kind=game");
  await page.getByLabel("Title").fill("Test Quest");
  await page.getByLabel("Platform").fill("PC");
  await page.getByLabel("Cover image URL").fill("https://evil.example/cover.png");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText(/allowed host/).first()).toBeVisible();
  await page.getByLabel("Cover image URL").fill("https://cdn.myanimelist.net/images/anime/fixture/1001.jpg");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Test Quest" })).toBeVisible();
  for (const tab of ["Tier List", "Codes", "Guides", "Checklist"]) {
    await expect(page.getByRole("tab", { name: tab })).toBeVisible();
  }

  // Markdown is rendered and sanitized
  await page.getByRole("tab", { name: "Codes" }).click();
  await page.getByRole("button", { name: "Edit codes" }).click();
  await page.getByRole("textbox", { name: "Codes (Markdown)" }).fill("**LAUNCH2026** <script>window.__pwned = true</script> <img src=x onerror=alert(1)>");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("strong", { hasText: "LAUNCH2026" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned)).toBeUndefined();
  expect(await page.locator("[role=tabpanel] script").count()).toBe(0);

  // Checklist tab
  await page.getByRole("tab", { name: "Checklist" }).click();
  await page.getByLabel("New item in Checklist").fill("Beat the first boss");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Beat the first boss" })).toBeVisible();
  await page.getByLabel("New item in Checklist").fill("Find all secrets");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("checkbox", { name: "Beat the first boss" }).click();
  await expect(page.getByText("1/2 done")).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Checklist" }).click();
  await expect(page.getByRole("checkbox", { name: "Beat the first boss" })).toHaveAttribute("data-state", "checked");
  await shot("custom-game");
  await assertLayoutAndA11y(page);

  // --- Dashboard ---------------------------------------------------------------
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Fixture Saga, Anime/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Test Quest, Game/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Continue watching" })).toBeVisible();
  await page.goto("/?kind=game");
  await expect(page.getByRole("link", { name: /Fixture Saga, Anime/ })).toHaveCount(0);
  await shot("dashboard");
  await assertLayoutAndA11y(page);

  // --- Connect and synchronize MyAnimeList --------------------------------------
  await resetMalMock();
  await page.goto("/sync");
  await page.getByRole("link", { name: "Connect MyAnimeList" }).click();
  await expect(page).toHaveURL(/\/sync\?mal=connected/);
  await expect(page.getByText("MyAnimeList connected")).toBeVisible();

  await runE2EWorker(); // full list pull
  await page.reload();
  await expect(page.getByRole("heading", { name: "Review the initial sync" })).toBeVisible();
  await expect(page.getByText("Not In Archive")).toBeVisible();
  // Local (5 watched) and MAL (3 watched) differ: an explicit decision is required.
  await expect(page.getByRole("button", { name: "Approve sync" })).toBeDisabled();
  await page.getByRole("button", { name: "Keep archive for all" }).click();
  await page.getByRole("checkbox", { name: /Also write future archive changes/ }).click();
  await page.getByRole("button", { name: "Approve sync" }).click();
  await expect(page.getByText("Initial sync approved")).toBeVisible();

  await makeOutboxDue();
  await runE2EWorker();
  const state = await mockState();
  expect(state.patches.some((patch) => patch.id === 1001 && patch.body.num_watched_episodes === "5")).toBe(true);
  await page.reload();
  await expect(page.getByText("Synced").first()).toBeVisible();
  await shot("sync");
  await assertLayoutAndA11y(page);
});
