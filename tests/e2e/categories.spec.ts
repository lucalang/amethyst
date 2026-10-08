import { expect, test, type Page } from "@playwright/test";
import { E2E_USERS, assertLayoutAndA11y, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

const userFor = (project: string) => (project === "mobile" ? E2E_USERS.mobile : E2E_USERS.desktop);

async function createEntry(page: Page, collection: "anime" | "games" | "other", title: string, categories: { create?: string[]; pick?: string[] }) {
  await page.goto(`/${collection}/new`);
  await page.getByLabel("Title").fill(title);
  if (categories.create?.length || categories.pick?.length) {
    await page.getByRole("button", { name: /^Add/ }).click();
    const search = page.getByRole("combobox", { name: "Categories" });
    for (const name of categories.create ?? []) {
      await search.fill(name);
      const created = page.waitForResponse((response) => response.url().endsWith("/api/categories") && response.request().method() === "POST");
      await page.getByRole("option", { name: `Create “${name}”` }).click();
      await created;
      await expect(search).toHaveValue("");
    }
    for (const name of categories.pick ?? []) {
      await search.fill(name);
      await page.getByRole("option", { name, exact: true }).click();
    }
    await page.keyboard.press("Escape");
  }
  const chips = page.getByRole("group", { name: "Categories" });
  for (const name of [...(categories.create ?? []), ...(categories.pick ?? [])]) await expect(chips.getByText(name, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Create (anime|game|entry)$/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

const poster = (page: Page, title: string) => page.getByRole("link", { name: new RegExp(`^${title},`) });

async function filterBy(page: Page, names: string[]) {
  await page.getByRole("button", { name: /^(Filter by category|Categories: \d+ selected)$/ }).click();
  const search = page.getByRole("combobox", { name: "Filter by category" });
  for (const name of names) {
    await search.fill(name);
    await page.getByRole("option", { name: new RegExp(`^${name}`) }).click();
  }
  await page.keyboard.press("Escape");
}

test("categories: type separation, match all, edit, rename and delete", async ({ page }, testInfo) => {
  const user = userFor(testInfo.project.name);
  await signIn(page, user.email, user.password);

  // Create categories directly from the creation form; several per entry, any entry type.
  await createEntry(page, "games", "Bloons TD 6", { create: ["Tower Defense", "AFK"] });
  await expect(page.getByRole("list", { name: "Categories" }).getByRole("link")).toHaveText(["AFK", "Tower Defense"]);
  await createEntry(page, "games", "AFK Journey", { pick: ["AFK"] });
  await createEntry(page, "games", "Hollow Knight", {});
  await page.goto("/anime/new");
  await page.getByRole("button", { name: "Add categories" }).click();
  await expect(page.getByRole("option", { name: "Tower Defense", exact: true })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "AFK", exact: true })).toHaveCount(0);
  await createEntry(page, "anime", "Frieren", { create: ["AFK", "Romance"] });
  await createEntry(page, "other", "Custom Notes", { create: ["AFK"] });

  // Names are unique regardless of case: an existing match offers no "Create" action.
  await page.goto("/anime/new");
  await page.getByRole("button", { name: "Add categories" }).click();
  await page.getByRole("combobox", { name: "Categories" }).fill("romance");
  await expect(page.getByRole("option", { name: "Romance" })).toBeVisible();
  await expect(page.getByRole("option", { name: /Create/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // The filter matches ALL selected categories and stays inside the current library.
  await page.goto("/games");
  await filterBy(page, ["Tower Defense"]);
  await expect(page).toHaveURL(/categories=/);
  await expect(poster(page, "Bloons TD 6")).toBeVisible();
  await expect(poster(page, "AFK Journey")).toHaveCount(0);
  await filterBy(page, ["AFK"]);
  await expect(page.getByRole("button", { name: "Categories: 2 selected" })).toBeVisible();
  await expect(poster(page, "Bloons TD 6")).toBeVisible();
  await expect(poster(page, "AFK Journey")).toHaveCount(0);
  await expect(poster(page, "Hollow Knight")).toHaveCount(0);
  await expect(poster(page, "Frieren")).toHaveCount(0);
  const active = page.getByRole("group", { name: "Active category filters" });
  await expect(active.getByText("AFK", { exact: true })).toBeVisible();
  await assertLayoutAndA11y(page);
  await page.screenshot({ path: `tests/e2e/screenshots/${testInfo.project.name}-category-filter.png`, fullPage: false });
  // Combined with search, and cleared in one click.
  await page.getByLabel("Search Games").fill("journey");
  await page.getByLabel("Search Games").press("Enter");
  await expect(poster(page, "AFK Journey")).toHaveCount(0);
  await expect(poster(page, "Bloons TD 6")).toHaveCount(0);
  await expect(page.getByText("Nothing matches")).toBeVisible();
  await active.getByRole("button", { name: "Clear categories" }).click();
  await expect(page).not.toHaveURL(/categories=/);
  await expect(page.getByRole("button", { name: "Filter by category" })).toBeVisible();

  // Edit an existing entry's categories without touching its workspace.
  await page.goto("/games");
  await poster(page, "Bloons TD 6").click();
  await page.getByRole("button", { name: "Edit details" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit details" });
  await dialog.getByRole("button", { name: "Remove AFK" }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("list", { name: "Categories" }).getByRole("link")).toHaveText(["Tower Defense"]);
  await page.reload();
  await expect(page.getByRole("list", { name: "Categories" }).getByRole("link")).toHaveText(["Tower Defense"]);
  await expect(page.getByRole("heading", { level: 1, name: "Bloons TD 6" })).toBeVisible();

  // Rename updates every assignment; delete removes the label, never the entries.
  await page.goto("/settings?collection=games#categories");
  const list = page.getByRole("list", { name: "Your categories" });
  await expect(list.getByText("Romance", { exact: true })).toHaveCount(0);
  await expect(list.getByText("1 entry")).toHaveCount(2);
  await list.getByRole("button", { name: "Rename Tower Defense" }).click();
  await expect(list.getByRole("textbox", { name: "New name for Tower Defense" })).toBeFocused();
  await list.getByRole("textbox", { name: "New name for Tower Defense" }).fill("AFK");
  await list.getByRole("button", { name: "Save name" }).click();
  await expect(list.getByRole("alert")).toBeVisible();
  await expect(list.getByRole("textbox", { name: "New name for Tower Defense" })).toHaveValue("AFK");
  await list.getByRole("textbox", { name: "New name for Tower Defense" }).fill("TD");
  await list.getByRole("button", { name: "Save name" }).click();
  await expect(list.getByText("TD", { exact: true })).toBeVisible();
  await list.getByRole("button", { name: "Delete AFK" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Delete “AFK”?" });
  await expect(confirm).toContainText("The entries themselves are not deleted.");
  await confirm.getByRole("button", { name: "Delete category" }).click();
  await expect(list.getByText("AFK", { exact: true })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Category entry type" }).getByRole("link", { name: "Anime", exact: true }).click();
  await expect(list.getByText("AFK", { exact: true })).toBeVisible();
  await expect(list.getByText("TD", { exact: true })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Category entry type" }).getByRole("link", { name: "Other", exact: true }).click();
  await expect(list.getByText("AFK", { exact: true })).toBeVisible();
  await expect(list.getByText("Romance", { exact: true })).toHaveCount(0);

  await page.goto("/games");
  await expect(poster(page, "AFK Journey")).toBeVisible();
  await poster(page, "Bloons TD 6").click();
  await expect(page.getByRole("list", { name: "Categories" }).getByRole("link")).toHaveText(["TD"]);
});
