import { expect, test } from "@playwright/test";
import { E2E_USERS, assertLayoutAndA11y, explorer, nodeSaved, rowActions, signIn, treeItem } from "./helpers";

test.describe.configure({ mode: "serial" });

const COVER = "https://cdn.myanimelist.net/images/anime/6/73245.jpg";

test("anime workspace: create, organize folders, write, check custom arcs, reload", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile";
  const user = mobile ? E2E_USERS.mobile : E2E_USERS.desktop;
  const shot = (name: string) => page.screenshot({ path: `tests/e2e/screenshots/${testInfo.project.name}-${name}.png`, fullPage: true });

  await signIn(page, user.email, user.password);
  await expect(page.getByRole("heading", { name: "Your archive is empty" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Import|Sync/ })).toHaveCount(0);
  await expect(page.getByText(/MyAnimeList/i)).toHaveCount(0);

  // --- Manual anime creation: a name and an image, no catalog lookup ----------
  await page.getByRole("link", { name: "New anime" }).click();
  await expect(page.getByRole("radio", { name: "Anime" })).toBeChecked();
  await page.getByLabel("Title").fill("One Piece");
  await page.getByLabel("Cover image URL").fill("https://evil.example/cover.png");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText(/allowed host/).first()).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("One Piece");
  await page.getByLabel("Cover image URL").fill(COVER);
  await page.getByRole("button", { name: "Create" }).click();

  const header = page.getByTestId("entry-header");
  await expect(page.getByRole("heading", { level: 1, name: "One Piece" })).toBeVisible();
  await expect(header.getByText("Anime", { exact: true })).toBeVisible();
  await expect(header.getByRole("img", { name: "One Piece cover" })).toBeVisible();
  // Written content lives in files: there is no separate Notes panel any more.
  await expect(page.getByRole("heading", { name: "Notes" })).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: /notes/i })).toHaveCount(0);

  let files = await explorer(page, mobile);
  await expect(treeItem(files, "Arcs", "checklist")).toBeVisible();
  await expect(treeItem(files, "Notes", "note")).toBeVisible();
  await assertLayoutAndA11y(page);

  // --- Nested folders -----------------------------------------------------------
  await files.getByRole("button", { name: "New folder" }).click();
  await files.getByRole("textbox", { name: "Name for the new folder" }).fill("Sagas");
  await files.getByRole("textbox", { name: "Name for the new folder" }).press("Enter");
  const sagas = treeItem(files, "Sagas", "folder");
  await expect(sagas).toBeVisible();

  await rowActions(files, "Sagas").click();
  await page.getByRole("menuitem", { name: "New folder" }).click();
  await files.getByRole("textbox", { name: "Name for the new folder" }).fill("East Blue");
  await files.getByRole("textbox", { name: "Name for the new folder" }).press("Enter");
  await expect(sagas).toHaveAttribute("aria-expanded", "true");
  const eastBlue = treeItem(sagas, "East Blue", "folder");
  await expect(eastBlue).toHaveAttribute("aria-level", "2");

  // Sibling names are unique within a folder.
  await rowActions(files, "Sagas").click();
  await page.getByRole("menuitem", { name: "New folder" }).click();
  await files.getByRole("textbox", { name: "Name for the new folder" }).fill("east blue");
  await files.getByRole("textbox", { name: "Name for the new folder" }).press("Enter");
  await expect(files.getByRole("alert")).toContainText("already exists in this folder");
  await files.getByRole("textbox", { name: "Name for the new folder" }).press("Escape");

  // --- A custom checklist of arcs (including ones no catalog knows) -------------
  await rowActions(files, "East Blue").click();
  await page.getByRole("menuitem", { name: "New checklist" }).click();
  await files.getByRole("textbox", { name: "Name for the new checklist" }).fill("East Blue arcs");
  await files.getByRole("textbox", { name: "Name for the new checklist" }).press("Enter");

  const newItem = page.getByRole("textbox", { name: "New item in East Blue arcs" });
  await expect(newItem).toBeFocused();
  await newItem.fill("Romance Dawn\nOrange Town\nMy own filler arc");
  await expect(page.getByText("3 items will be added, one per line.")).toBeVisible();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  for (const label of ["Romance Dawn", "Orange Town", "My own filler arc"]) {
    await expect(page.getByRole("checkbox", { name: label })).toBeVisible();
  }
  await page.getByRole("checkbox", { name: "Romance Dawn" }).click();
  await page.getByRole("checkbox", { name: "My own filler arc" }).click();
  await expect(page.getByText("2/3 done")).toBeVisible();

  await page.getByRole("button", { name: "Actions for Orange Town", exact: true }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("textbox", { name: "Item label" }).fill("Orange Town (Buggy)");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Orange Town (Buggy)" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await expect(header.getByText("2/3 checklist items done")).toBeVisible();
  await shot("checklist");

  // --- Writing a note -------------------------------------------------------------
  files = await explorer(page, mobile);
  await rowActions(files, "East Blue").click();
  await page.getByRole("menuitem", { name: "New note" }).click();
  await files.getByRole("textbox", { name: "Name for the new note" }).fill("Thoughts");
  await files.getByRole("textbox", { name: "Name for the new note" }).press("Enter");
  const editor = page.getByRole("textbox", { name: "Contents of Thoughts" });
  await expect(editor).toBeFocused();
  const saved = nodeSaved(page);
  await editor.fill("Luffy sets sail.\n\n**Zoro** joins the crew.");
  await saved;
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.locator("strong", { hasText: "Zoro" })).toBeVisible();
  await page.getByRole("button", { name: "Write" }).click();

  // --- Rename, move and delete -----------------------------------------------------
  files = await explorer(page, mobile);
  await rowActions(files, "Thoughts").click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await files.getByRole("textbox", { name: "New name" }).fill("Crew notes");
  await files.getByRole("textbox", { name: "New name" }).press("Enter");
  await expect(treeItem(files, "Crew notes", "note")).toHaveAttribute("aria-level", "3");
  // On small screens the page behind the open file sheet is inert.
  if (!mobile) await expect(page.getByRole("navigation", { name: "File path" })).toContainText("Crew notes");

  await rowActions(files, "Crew notes").click();
  await page.getByRole("menuitem", { name: "Move to…" }).click();
  const moveDialog = page.getByRole("dialog", { name: "Move “Crew notes”" });
  await expect(moveDialog.getByRole("radio", { name: "East Blue" })).toBeDisabled();
  await moveDialog.getByRole("radio", { name: "Sagas" }).check();
  await moveDialog.getByRole("button", { name: "Move here" }).click();
  await expect(page.getByText("Moved “Crew notes” to “Sagas”.")).toBeVisible();
  await expect(treeItem(sagas, "Crew notes", "note")).toHaveAttribute("aria-level", "2");

  await rowActions(files, "Notes").click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Delete “Notes”?" });
  await expect(confirm).toContainText("This note and its text will be permanently deleted.");
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(treeItem(files, "Notes", "note")).toHaveCount(0);

  if (!mobile) {
    // Drag and drop a root checklist into a folder.
    await treeItem(files, "Arcs", "checklist").locator("> div").dragTo(sagas.locator("> div").first());
    await expect(treeItem(sagas, "Arcs", "checklist")).toHaveAttribute("aria-level", "2");
    // Keyboard: collapse and expand with the arrow keys.
    await sagas.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(sagas).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("ArrowRight");
    await expect(sagas).toHaveAttribute("aria-expanded", "true");
  }
  await shot("tree");
  await assertLayoutAndA11y(page);

  // --- Everything survives a reload -----------------------------------------------
  await treeItem(files, "Crew notes", "note").locator("> div").click();
  await expect(page).toHaveURL(/\?file=/);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Contents of Crew notes" })).toHaveValue("Luffy sets sail.\n\n**Zoro** joins the crew.");
  files = await explorer(page, mobile);
  await expect(sagas).toHaveAttribute("aria-expanded", "true");
  await expect(eastBlue).toHaveAttribute("aria-expanded", "true");
  await treeItem(files, "East Blue arcs", "checklist").locator("> div").click();
  await expect(page.getByRole("checkbox", { name: "Romance Dawn" })).toHaveAttribute("data-state", "checked");
  await expect(page.getByRole("checkbox", { name: "Orange Town (Buggy)" })).toHaveAttribute("data-state", "unchecked");
  await expect(page.getByRole("checkbox", { name: "My own filler arc" })).toHaveAttribute("data-state", "checked");

  // --- Layout: collapsible explorer, editor keeps the space, header scrolls away ---
  if (mobile) {
    await expect(page.getByRole("dialog", { name: "Files" })).toBeHidden();
    await expect(page.getByRole("complementary", { name: "Explorer" })).toBeHidden();
    const width = (await page.getByRole("list", { name: "East Blue arcs items" }).boundingBox())!.width;
    expect(width).toBeGreaterThan(page.viewportSize()!.width * 0.8);
  } else {
    await page.getByRole("button", { name: "Hide explorer" }).click();
    await expect(page.getByRole("complementary", { name: "Explorer" })).toHaveCount(0);
    await page.getByRole("button", { name: "Show explorer" }).click();
    await expect(page.getByRole("complementary", { name: "Explorer" })).toBeVisible();
  }

  expect(await header.evaluate((element) => getComputedStyle(element).position)).toBe("static");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(async () => {
    const box = await header.boundingBox();
    return box ? box.y + box.height : 0;
  }).toBeLessThanOrEqual(56);
  const workspaceTop = (await page.getByRole("region", { name: "Workspace" }).boundingBox())!.y;
  expect(workspaceTop).toBeLessThan(120);
  if (!mobile) {
    // The explorer stays in view (sticky within the workspace) while the header is gone.
    const treeTop = (await page.getByRole("tree", { name: "Files in One Piece" }).boundingBox())!.y;
    expect(treeTop).toBeGreaterThanOrEqual(56);
    expect(treeTop).toBeLessThan(200);
  }
  await shot("scrolled");

  // --- Library -----------------------------------------------------------------------
  await page.goto("/");
  await expect(page.getByRole("link", { name: /One Piece, Anime, 2 of 3 items/ })).toBeVisible();
  await page.goto("/?kind=game");
  await expect(page.getByRole("link", { name: /One Piece/ })).toHaveCount(0);
});

test("games: starter files, sanitized Markdown, checklist and details", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile";
  const user = mobile ? E2E_USERS.mobile : E2E_USERS.desktop;
  await signIn(page, user.email, user.password);

  await page.goto("/entries/new?kind=game");
  await expect(page.getByRole("radio", { name: "Game" })).toBeChecked();
  await page.getByLabel("Title").fill("Test Quest");
  await page.getByLabel("Platform").fill("PC");
  await page.getByRole("button", { name: "Create" }).click();
  const header = page.getByTestId("entry-header");
  await expect(page.getByRole("heading", { level: 1, name: "Test Quest" })).toBeVisible();
  await expect(header.getByText("PC", { exact: true })).toBeVisible();

  let files = await explorer(page, mobile);
  for (const name of ["Tier List", "Codes", "Guides"]) await expect(treeItem(files, name, "note")).toBeVisible();
  await expect(treeItem(files, "Checklist", "checklist")).toBeVisible();

  await treeItem(files, "Codes", "note").locator("> div").click();
  const editor = page.getByRole("textbox", { name: "Contents of Codes" });
  const saved = nodeSaved(page);
  await editor.fill("**LAUNCH2026** <script>window.__pwned = true</script> <img src=x onerror=alert(1)>");
  await saved;
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.locator("strong", { hasText: "LAUNCH2026" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned)).toBeUndefined();
  expect(await page.locator("main script").count()).toBe(0);
  await page.getByRole("button", { name: "Write" }).click();

  files = await explorer(page, mobile);
  await treeItem(files, "Checklist", "checklist").locator("> div").click();
  await page.getByRole("textbox", { name: "New item in Checklist" }).fill("Beat the first boss");
  await page.getByRole("textbox", { name: "New item in Checklist" }).press("Enter");
  await page.getByRole("checkbox", { name: "Beat the first boss" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Beat the first boss" })).toHaveAttribute("data-state", "checked");

  await page.getByRole("button", { name: "Edit details" }).click();
  await page.getByLabel("Title").fill("Test Quest II");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Test Quest II" })).toBeVisible();
  await page.screenshot({ path: `tests/e2e/screenshots/${testInfo.project.name}-game.png`, fullPage: true });
  await assertLayoutAndA11y(page);
});

test("saving problems are visible and recoverable", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  await signIn(page, E2E_USERS.desktop.email, E2E_USERS.desktop.password);
  await page.getByRole("link", { name: /Test Quest II/ }).click();
  const files = await explorer(page, false);
  await treeItem(files, "Guides", "note").locator("> div").click();
  const editor = page.getByRole("textbox", { name: "Contents of Guides" });

  // Offline: the error is shown, the text stays, and Retry saves it.
  await page.route("**/api/nodes/*", (route) => (route.request().method() === "PATCH" ? route.abort("internetdisconnected") : route.continue()));
  await editor.fill("Boss order: Hornet first.");
  await expect(page.getByRole("status").filter({ hasText: /Not saved/ })).toBeVisible();
  await page.unroute("**/api/nodes/*");
  const saved = nodeSaved(page);
  await page.getByRole("button", { name: "Retry" }).click();
  await saved;
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();

  // A second tab changes the same note: the first tab is told instead of overwriting it.
  const other = await context.newPage();
  await other.goto(page.url());
  const otherEditor = other.getByRole("textbox", { name: "Contents of Guides" });
  await expect(otherEditor).toHaveValue("Boss order: Hornet first.");
  const otherSaved = nodeSaved(other);
  await otherEditor.fill("Written in the other tab.");
  await otherSaved;
  await other.close();

  await editor.fill("Boss order: Hornet first, then the Mantis Lords.");
  await expect(page.getByRole("alert").filter({ hasText: "changed somewhere else" })).toBeVisible();
  const kept = nodeSaved(page);
  await page.getByRole("button", { name: "Keep my version" }).click();
  await kept;
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Contents of Guides" })).toHaveValue("Boss order: Hornet first, then the Mantis Lords.");
});
