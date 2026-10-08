import { expect, test, type Page } from "@playwright/test";
import { adminClient } from "../support/local-supabase";
import {
  E2E_USERS,
  assertLayoutAndA11y,
  explorer,
  itemSaved,
  newLine,
  nodeSaved,
  noteEditor,
  rowActions,
  signIn,
  storedContent,
  treeItem,
  typeInEditor,
} from "./helpers";

test.describe.configure({ mode: "serial" });

// Real external hosts: placehold.co serves directly, picsum.photos answers with a redirect to its CDN.
const ONE_PIECE_COVER = "https://placehold.co/300x450/png?text=One+Piece";
const FORTNITE_COVER = "https://picsum.photos/id/96/300/450";

const userFor = (project: string) => (project === "mobile" ? E2E_USERS.mobile : E2E_USERS.desktop);
const shot = (page: Page, project: string, name: string, fullPage = true) =>
  page.screenshot({ path: `tests/e2e/screenshots/${project}-${name}.png`, fullPage });

async function openEntry(page: Page, collection: "anime" | "games", title: string) {
  await page.goto(`/${collection}`);
  await page.getByRole("link", { name: new RegExp(`^${title},`) }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

/** New entries start empty; later steps work with these files. */
async function addRootFiles(page: Page, entryId: string, files: { kind: "note" | "checklist"; name: string }[]) {
  for (const file of files) {
    const response = await page.request.post(`/api/entries/${entryId}/nodes`, {
      headers: { Origin: new URL(page.url()).origin },
      data: { parentId: null, kind: file.kind, name: file.name },
    });
    expect(response.ok(), file.name).toBe(true);
  }
}

test("custom entries are discoverable before the first entry", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  const user = userFor(project);
  await signIn(page, user.email, user.password);
  const navigation = page.getByRole("navigation", { name: project === "mobile" ? "Primary" : "Collections" });
  const other = navigation.getByRole("link", { name: "Other", exact: true });
  await expect(other).toBeVisible();
  await other.click();
  await expect(page).toHaveURL(/\/other$/);
  await expect(page.getByRole("heading", { name: "No other yet" })).toBeVisible();
  await expect(other).toHaveAttribute("aria-current", "page");
  await assertLayoutAndA11y(page);
  await shot(page, project, "other-empty");
  await page.getByRole("main").getByRole("link", { name: "New entry", exact: true }).first().click();
  await expect(page).toHaveURL(/\/other\/new$/);
  await page.getByLabel("Title", { exact: true }).fill("Custom workspace");
  await page.getByRole("button", { name: "Create entry", exact: true }).click();
  await expect(page).toHaveURL(/\/other\/[0-9a-f-]{36}(\?|$)/);
  await expect(page.getByRole("heading", { name: "Custom workspace", exact: true })).toBeVisible();
  await other.click();
  await expect(page.getByRole("link", { name: /^Custom workspace,/ })).toBeVisible();
  await assertLayoutAndA11y(page);
  await shot(page, project, "other-created");

  if (project === "desktop") {
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "New", exact: true }).click();
    await page.getByRole("menuitem", { name: "Other", exact: true }).click();
    await expect(page).toHaveURL(/\/other\/new$/);
    await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
  }
});

test("anime and games are separate libraries with artwork from any public host", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  const user = userFor(project);
  await signIn(page, user.email, user.password);
  await expect(page).toHaveTitle("Anime · Amethyst Archives");
  await expect(page.getByRole("heading", { level: 1, name: "Anime" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No anime yet" })).toBeVisible();
  await expect(page.getByText(/MyAnimeList/i)).toHaveCount(0);

  // --- Anime with an external cover: private and non-image links are explained ---------
  await page.getByRole("main").getByRole("link", { name: "New anime" }).first().click();
  await expect(page).toHaveURL(/\/anime\/new$/);
  await page.getByLabel("Title").fill("One Piece");
  const cover = page.getByLabel("Cover image URL");
  await cover.fill("http://127.0.0.1/cover.png");
  await expect(page.getByText("Local and private network addresses are not allowed.")).toBeVisible();
  await cover.fill("https://example.com/");
  await expect(page.getByText(/returns a web page, not an image/)).toBeVisible({ timeout: 20_000 });
  await cover.fill(ONE_PIECE_COVER);
  await expect(page.getByText(/Image found · PNG/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("img", { name: "Cover image URL preview" })).toBeVisible();
  await assertLayoutAndA11y(page);
  await page.getByRole("button", { name: "Create anime" }).click();

  await expect(page).toHaveURL(/\/anime\/[0-9a-f-]{36}(\?|$)/);
  const onePieceId = new URL(page.url()).pathname.split("/")[2];
  const header = page.getByTestId("entry-header");
  await expect(page.getByRole("heading", { level: 1, name: "One Piece" })).toBeVisible();
  await expect(page).toHaveTitle("One Piece · Amethyst Archives");
  await expect(header.getByText("Anime", { exact: true })).toBeVisible();
  const coverImage = header.getByRole("img", { name: "One Piece cover" });
  await expect.poll(() => coverImage.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name: "Start your workspace" })).toBeVisible();
  await addRootFiles(page, onePieceId, [
    { kind: "note", name: "Notes" },
    { kind: "checklist", name: "Arcs" },
  ]);

  // --- A game in its own library -------------------------------------------------------
  await page.goto("/games");
  await expect(page.getByRole("heading", { level: 1, name: "Games" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^One Piece,/ })).toHaveCount(0);
  await page.getByRole("main").getByRole("link", { name: "New game" }).first().click();
  await page.getByLabel("Title").fill("Fortnite");
  await expect(page.getByLabel(/platform/i)).toHaveCount(0);
  await page.getByLabel("Cover image URL").fill(FORTNITE_COVER);
  await expect(page.getByText(/Image found · JPEG/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Create game" }).click();
  await expect(page).toHaveURL(/\/games\/[0-9a-f-]{36}(\?|$)/);
  await expect(page.getByRole("heading", { level: 1, name: "Fortnite" })).toBeVisible();
  await expect(page.getByTestId("entry-header").getByText("Game", { exact: true })).toBeVisible();

  const gameId = new URL(page.url()).pathname.split("/")[2];
  await addRootFiles(page, gameId, [
    { kind: "note", name: "Guides" },
    { kind: "checklist", name: "Checklist" },
  ]);
  const admin = adminClient();
  const { data: newGame } = await admin.from("entries").select("platform").eq("id", gameId).single();
  expect(newGame?.platform).toBeNull();
  const { error: legacyError } = await admin.from("entries").update({ platform: "Legacy PC" }).eq("id", gameId);
  expect(legacyError).toBeNull();
  await page.reload();
  await page.getByRole("button", { name: "Edit details" }).click();
  const editDetails = page.getByRole("dialog", { name: "Edit details" });
  await expect(editDetails.getByLabel(/platform/i)).toHaveCount(0);
  const detailsSaved = page.waitForResponse((response) => response.url().includes(`/api/entries/${gameId}`) && response.request().method() === "PATCH");
  await editDetails.getByRole("button", { name: "Save", exact: true }).click();
  const detailsResponse = await detailsSaved;
  expect(detailsResponse.ok()).toBe(true);
  expect(detailsResponse.request().postDataJSON()).not.toHaveProperty("platform");
  await expect(editDetails).not.toBeVisible();
  const { data: legacyGame } = await admin.from("entries").select("platform").eq("id", gameId).single();
  expect(legacyGame?.platform).toBe("Legacy PC");

  // --- Never mixed: each library, its search and its "new" flow are scoped --------------
  await page.goto("/games");
  await expect(page.getByRole("link", { name: /^Fortnite,/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^One Piece,/ })).toHaveCount(0);
  await expect.poll(() => page.getByRole("link", { name: /^Fortnite,/ }).locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await shot(page, project, "library-games");
  await page.goto("/anime");
  await expect(page.getByRole("link", { name: /^One Piece,/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Fortnite,/ })).toHaveCount(0);
  await expect.poll(() => page.getByRole("link", { name: /^One Piece,/ }).locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await assertLayoutAndA11y(page);
  await shot(page, project, "library-anime");

  await page.getByLabel("Search Anime").fill("Fortnite");
  await page.getByLabel("Search Anime").press("Enter");
  await expect(page).toHaveURL(/\/anime\?q=Fortnite/);
  await expect(page.getByText("Nothing matches")).toBeVisible();
  await page.goto("/games?q=fort");
  await expect(page.getByRole("link", { name: /^Fortnite,/ })).toBeVisible();

  // --- Old links land in the right collection --------------------------------------------
  await page.goto(`/entries/${onePieceId}`);
  await expect(page).toHaveURL(new RegExp(`/anime/${onePieceId}$`));
  await page.goto(`/games/${onePieceId}`);
  await expect(page).toHaveURL(new RegExp(`/anime/${onePieceId}$`));
  await page.goto("/");
  await expect(page).toHaveURL(/\/anime$/);

  if (project === "desktop") {
    // Existing custom entries keep their own "Other" collection instead of being miscategorized.
    const admin = adminClient();
    const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const owner = users.users.find((candidate) => candidate.email === user.email)!;
    const { error } = await admin.from("entries").insert({ user_id: owner.id, kind: "custom", title: "Reading list" });
    expect(error).toBeNull();
    await page.reload();
    const nav = page.getByRole("navigation", { name: "Collections" });
    await expect(nav.getByRole("link", { name: "Anime" })).toHaveAttribute("aria-current", "page");
    await nav.getByRole("link", { name: "Other" }).click();
    await expect(page.getByRole("link", { name: /^Reading list,/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /^One Piece,|^Fortnite,/ })).toHaveCount(0);
    await page.goto("/anime");
    await expect(page.getByRole("link", { name: /^Reading list,/ })).toHaveCount(0);
  }
});

test("workspace: nested folders, files, rename, move, delete and reload", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  const mobile = project === "mobile";
  const user = userFor(project);
  await signIn(page, user.email, user.password);
  await openEntry(page, "anime", "One Piece");
  const header = page.getByTestId("entry-header");
  // Written content lives in files: there is no separate Notes panel.
  await expect(page.getByRole("complementary", { name: /notes/i })).toHaveCount(0);

  let files = await explorer(page, mobile);
  await expect(treeItem(files, "Arcs", "checklist")).toBeVisible();
  await expect(treeItem(files, "Notes", "note")).toBeVisible();

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

  await rowActions(files, "Sagas").click();
  await page.getByRole("menuitem", { name: "New folder" }).click();
  await files.getByRole("textbox", { name: "Name for the new folder" }).fill("east blue");
  await files.getByRole("textbox", { name: "Name for the new folder" }).press("Enter");
  await expect(files.getByRole("alert")).toContainText("already exists in this folder");
  await files.getByRole("textbox", { name: "Name for the new folder" }).press("Escape");

  // --- A checklist of arcs, pasted as a list ---------------------------------------------
  await rowActions(files, "East Blue").click();
  await page.getByRole("menuitem", { name: "New checklist" }).click();
  await files.getByRole("textbox", { name: "Name for the new checklist" }).fill("East Blue arcs");
  await files.getByRole("textbox", { name: "Name for the new checklist" }).press("Enter");
  const addTask = page.getByRole("textbox", { name: "Add a task to East Blue arcs" });
  await expect(addTask).toBeFocused();
  await addTask.fill("Romance Dawn\nOrange Town\nMy own filler arc");
  await expect(page.getByText("3 tasks will be added, one per line.")).toBeVisible();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  for (const label of ["Romance Dawn", "Orange Town", "My own filler arc"]) await expect(page.getByRole("checkbox", { name: label })).toBeVisible();
  await page.getByRole("checkbox", { name: "Romance Dawn" }).click();
  await page.getByRole("checkbox", { name: "My own filler arc" }).click();
  await expect(page.getByText("2 of 3 completed")).toBeVisible();
  await expect(header.getByText("2/3 tasks done")).toBeVisible();

  await page.getByRole("button", { name: "Actions for Orange Town", exact: true }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await expect(page.getByRole("textbox", { name: "Task name" })).toBeFocused();
  await page.getByRole("textbox", { name: "Task name" }).fill("   ");
  await page.getByRole("button", { name: "Save name", exact: true }).focus();
  await expect(page.getByRole("textbox", { name: "Task name" })).toHaveValue("   ");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Task name" })).toHaveValue("   ");
  await page.getByRole("textbox", { name: "Task name" }).fill("Orange Town (Buggy)");
  await page.getByRole("textbox", { name: "Task name" }).press("Enter");
  await expect(page.getByRole("checkbox", { name: "Orange Town (Buggy)" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();

  // --- A note ------------------------------------------------------------------------------
  files = await explorer(page, mobile);
  await rowActions(files, "East Blue").click();
  await page.getByRole("menuitem", { name: "New note" }).click();
  await files.getByRole("textbox", { name: "Name for the new note" }).fill("Thoughts");
  await files.getByRole("textbox", { name: "Name for the new note" }).press("Enter");
  const editor = noteEditor(page, "Thoughts");
  await expect(editor).toBeFocused();
  const saved = nodeSaved(page);
  await typeInEditor(page, editor, "Luffy sets sail.\n\n**Zoro** joins the crew.");
  await saved;
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();

  // --- Rename, move and delete ---------------------------------------------------------------
  files = await explorer(page, mobile);
  await rowActions(files, "Thoughts").click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await expect(files.getByRole("textbox", { name: "New name" })).toBeFocused();
  await files.getByRole("textbox", { name: "New name" }).fill("Cancelled name");
  await files.getByRole("textbox", { name: "New name" }).press("Escape");
  await expect(treeItem(files, "Thoughts", "note")).toBeVisible();
  await rowActions(files, "Thoughts").click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.route("**/api/nodes/*", async (route) => {
    if (route.request().method() === "PATCH") await route.fulfill({ status: 409, json: { error: "Rename check failure" } });
    else await route.continue();
  });
  await files.getByRole("textbox", { name: "New name" }).fill("Crew notes");
  await files.getByRole("textbox", { name: "New name" }).press("Enter");
  await expect(files.getByRole("alert")).toContainText("Rename check failure");
  await expect(files.getByRole("textbox", { name: "New name" })).toHaveValue("Crew notes");
  await page.unroute("**/api/nodes/*");
  await files.getByRole("textbox", { name: "New name" }).fill("Crew notes");
  await files.getByRole("textbox", { name: "New name" }).press("Enter");
  await expect(treeItem(files, "Crew notes", "note")).toHaveAttribute("aria-level", "3");
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
    await treeItem(files, "Arcs", "checklist").locator("> div").dragTo(sagas.locator("> div").first());
    await expect(treeItem(sagas, "Arcs", "checklist")).toHaveAttribute("aria-level", "2");
    await sagas.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(sagas).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("ArrowRight");
    await expect(sagas).toHaveAttribute("aria-expanded", "true");
  }
  await assertLayoutAndA11y(page);

  // --- Everything survives a reload ------------------------------------------------------------
  await treeItem(files, "Crew notes", "note").locator("> div").click();
  await expect(page).toHaveURL(/\?file=/);
  await page.reload();
  await expect(noteEditor(page, "Crew notes")).toContainText("Zoro joins the crew.");
  expect(await storedContent(page)).toBe("Luffy sets sail.\n\n**Zoro** joins the crew.");
  files = await explorer(page, mobile);
  await expect(sagas).toHaveAttribute("aria-expanded", "true");
  await expect(eastBlue).toHaveAttribute("aria-expanded", "true");
  await treeItem(files, "East Blue arcs", "checklist").locator("> div").click();
  await expect(page.getByRole("checkbox", { name: "Romance Dawn" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Orange Town (Buggy)" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "My own filler arc" })).toBeChecked();

  // --- The explorer collapses; the editor keeps the space ---------------------------------------
  if (mobile) {
    await expect(page.getByRole("dialog", { name: "Files" })).toBeHidden();
    await expect(page.getByRole("complementary", { name: "Explorer" })).toBeHidden();
    const width = (await page.getByRole("list", { name: "East Blue arcs tasks" }).boundingBox())!.width;
    expect(width).toBeGreaterThan(page.viewportSize()!.width * 0.8);
  } else {
    await page.getByRole("button", { name: "Hide explorer" }).click();
    await expect(page.getByRole("complementary", { name: "Explorer" })).toHaveCount(0);
    await page.getByRole("button", { name: "Show explorer" }).click();
    await expect(page.getByRole("complementary", { name: "Explorer" })).toBeVisible();
  }
  await shot(page, project, "workspace");
});

test("live preview: Markdown syntax shows on the caret line only", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  const mobile = project === "mobile";
  const user = userFor(project);
  await signIn(page, user.email, user.password);
  await openEntry(page, "anime", "One Piece");
  const files = await explorer(page, mobile);
  await files.getByRole("button", { name: "New note" }).click();
  await files.getByRole("textbox", { name: "Name for the new note" }).fill("Live preview");
  await files.getByRole("textbox", { name: "Name for the new note" }).press("Enter");

  const editor = noteEditor(page, "Live preview");
  await expect(editor).toBeFocused();
  const line = (index: number) => editor.locator(".cm-line").nth(index);

  // "## My Heading": editable syntax plus heading styling while the caret is on the line.
  await page.keyboard.insertText("## My Heading");
  await expect(line(0)).toHaveClass(/cm-md-h2/);
  await expect(line(0)).toHaveText("## My Heading");
  await expect(line(0).locator(".cm-md-mark")).toHaveText(/^##/);

  // Another line: "##" disappears, styling stays.
  await newLine(page, editor);
  await page.keyboard.insertText("Some **bold text** here");
  await expect(line(0)).toHaveText("My Heading");
  await expect(line(0)).toHaveClass(/cm-md-h2/);
  await expect(line(1)).toHaveText("Some **bold text** here");
  await expect(line(1).locator(".cm-md-strong")).toContainText("bold text");

  // Back on the heading: "##" is revealed again, and the bold markers hide on the other line.
  await page.keyboard.press("ArrowUp");
  await expect(line(0)).toHaveText("## My Heading");
  await expect(line(1)).toHaveText("Some bold text here");
  expect(await line(1).locator(".cm-md-strong").evaluate((element) => Number(getComputedStyle(element).fontWeight))).toBeGreaterThanOrEqual(700);

  // Clicking into the bold line reveals its markers.
  await line(1).click();
  await expect(line(1)).toHaveText("Some **bold text** here");
  await expect(line(0)).toHaveText("My Heading");

  // Toolbar: heading level, then undo/redo.
  await page.keyboard.press("ControlOrMeta+End");
  await newLine(page, editor);
  await page.keyboard.insertText("Toolbar line");
  await page.getByRole("button", { name: "Text style: Body text" }).click();
  await page.getByRole("menuitem", { name: /Heading 4/ }).click();
  await expect(line(2)).toHaveClass(/cm-md-h4/);
  await expect(line(2)).toHaveText("#### Toolbar line");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(line(2)).not.toHaveClass(/cm-md-h/);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(line(2)).toHaveClass(/cm-md-h4/);

  // Every heading level has its own colour, and sizes shrink by level.
  for (const text of ["# One", "### Three", "##### Five", "###### Six"]) {
    await page.keyboard.press("ControlOrMeta+End");
    await newLine(page, editor);
    await page.keyboard.insertText(text);
  }
  await page.keyboard.press("ControlOrMeta+End");
  await newLine(page, editor);
  await page.keyboard.insertText("Body text after the headings.");
  const styles = await editor.evaluate((root) =>
    [1, 2, 3, 4, 5, 6].map((level) => {
      const element = root.querySelector(`.cm-md-h${level}`)!;
      const style = getComputedStyle(element);
      return { color: style.color, size: parseFloat(style.fontSize) };
    }),
  );
  expect(styles.map((style) => style.color)).toEqual([
    "rgb(220, 207, 255)", // H1 soft lavender
    "rgb(179, 109, 255)", // H2 vivid purple
    "rgb(226, 79, 217)", // H3 magenta
    "rgb(255, 127, 174)", // H4 rose / pink
    "rgb(198, 185, 232)", // H5
    "rgb(163, 155, 189)", // H6
  ]);
  for (let level = 1; level < 6; level++) expect(styles[level - 1].size).toBeGreaterThan(styles[level].size);

  const expected = "## My Heading\nSome **bold text** here\n#### Toolbar line\n# One\n### Three\n##### Five\n###### Six\nBody text after the headings.";
  await expect.poll(() => storedContent(page), { timeout: 10_000 }).toBe(expected);
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await editor.scrollIntoViewIfNeeded();
  await shot(page, project, "headings", false);

  // After a reload the Markdown is intact and rendered; syntax reappears where the caret goes.
  await page.reload();
  const reloaded = noteEditor(page, "Live preview");
  const again = (index: number) => reloaded.locator(".cm-line").nth(index);
  await expect(again(0)).toHaveText("My Heading");
  await expect(again(0)).toHaveClass(/cm-md-h2/);
  await expect(again(1)).toHaveText("Some bold text here");
  await again(0).click();
  await expect(again(0)).toHaveText("## My Heading");
  await again(1).click();
  await expect(again(1)).toHaveText("Some **bold text** here");
  await expect(again(0)).toHaveText("My Heading");
  expect(await storedContent(page)).toBe(expected);

  // Keyboard shortcut for bold wraps the selection.
  await page.keyboard.press("ControlOrMeta+End");
  await newLine(page, reloaded);
  await page.keyboard.insertText("shortcut");
  await page.keyboard.press("Shift+Home");
  await page.keyboard.press("ControlOrMeta+b");
  await expect.poll(() => storedContent(page), { timeout: 10_000 }).toBe(`${expected}\n**shortcut**`);
});

test("tasks: To Do style list with steps, due dates, notes and importance", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  const mobile = project === "mobile";
  const user = userFor(project);
  await signIn(page, user.email, user.password);
  await openEntry(page, "anime", "One Piece");
  const files = await explorer(page, mobile);
  await treeItem(files, "Arcs", "checklist").locator("> div").click();

  const add = page.getByRole("textbox", { name: "Add a task to Arcs" });
  await add.fill("Alabasta");
  await add.press("Enter");
  await expect(page.getByRole("checkbox", { name: "Alabasta" })).toBeVisible();
  await add.fill("Skypiea\nWater 7\nEnies Lobby");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const active = page.getByRole("list", { name: "Arcs tasks" });
  await expect(active.getByRole("checkbox")).toHaveCount(4);

  // Completing a task moves it into the collapsible "Completed" section.
  await page.getByRole("checkbox", { name: "Alabasta" }).click();
  const completed = page.getByRole("list", { name: "Arcs completed tasks" });
  await expect(completed.getByRole("checkbox", { name: "Alabasta" })).toBeChecked();
  await expect(active.getByRole("checkbox", { name: "Alabasta" })).toHaveCount(0);
  await expect(page.getByText("1 of 4 completed")).toBeVisible();

  // Importance.
  const star = page.getByRole("button", { name: "Mark Water 7 as important" });
  const starred = itemSaved(page);
  await star.click();
  await starred;
  await expect(page.getByRole("button", { name: "Remove importance from Water 7" })).toHaveAttribute("aria-pressed", "true");

  // Details open inline under the task.
  await page.getByRole("button", { name: /^Skypiea/ }).click();
  const details = page.getByRole("region", { name: "Details for Skypiea" });
  await expect(details).toBeVisible();
  await expect(page.getByRole("button", { name: /^Skypiea/ })).toHaveAttribute("aria-expanded", "true");

  const addStep = details.getByRole("textbox", { name: "Add a step to Skypiea" });
  for (const label of ["Jaya", "Upper Yard", "Ordeal of Swamp"]) {
    const created = page.waitForResponse((response) => response.url().includes("/steps") && response.request().method() === "POST");
    await addStep.fill(label);
    await addStep.press("Enter");
    expect((await created).status()).toBe(201);
  }
  await expect(details.getByText("0 of 3")).toBeVisible();
  await details.getByRole("checkbox", { name: "Jaya" }).click();
  await expect(details.getByText("1 of 3")).toBeVisible();
  // Reorder with the keyboard: "Ordeal of Swamp" moves above "Upper Yard".
  const reordered = page.waitForResponse((response) => response.url().includes("/steps") && response.request().method() === "PUT");
  await details.getByRole("button", { name: "Ordeal of Swamp", exact: true }).focus();
  await page.keyboard.press("Alt+ArrowUp");
  await reordered;
  await expect(details.getByRole("listitem")).toHaveText([/Jaya/, /Ordeal of Swamp/, /Upper Yard/]);
  // Rename a step, delete another.
  await details.getByRole("button", { name: "Upper Yard", exact: true }).click();
  await details.getByRole("textbox", { name: "Step name" }).fill("Upper Yard (Enel)");
  await details.getByRole("textbox", { name: "Step name" }).press("Enter");
  await details.getByRole("button", { name: "Actions for step Ordeal of Swamp" }).click();
  await page.getByRole("menuitem", { name: "Delete step" }).click();
  await expect(details.getByRole("listitem")).toHaveText([/Jaya/, /Upper Yard \(Enel\)/]);

  // Due date and notes.
  const due = itemSaved(page);
  await details.getByRole("button", { name: "Tomorrow" }).click();
  await due;
  await expect(details.getByText("Tomorrow", { exact: true })).toBeVisible();
  const dueValue = await details.getByLabel("Due date", { exact: true }).inputValue();
  expect(dueValue).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const notesSaved = itemSaved(page);
  await details.getByLabel("Notes", { exact: true }).fill("Watch the Skypiea arc before the movie.\nEpisodes 153–195.");
  await notesSaved;
  await expect(details.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();

  const row = page.getByRole("button", { name: /^Skypiea/ });
  await expect(row).toContainText("1 of 2");
  await expect(row).toContainText("Tomorrow");
  await expect(row).toContainText("Note");
  await details.scrollIntoViewIfNeeded();
  await assertLayoutAndA11y(page);
  await shot(page, project, "task-details", false);

  // Hide completed tasks; the preference persists.
  await page.getByRole("button", { name: /^Completed/ }).click();
  await expect(completed).toHaveCount(0);

  // Everything is stored.
  await page.reload();
  await expect(page.getByRole("button", { name: /^Completed/ })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("list", { name: "Arcs completed tasks" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove importance from Water 7" })).toBeVisible();
  await page.getByRole("button", { name: /^Skypiea/ }).click();
  const reloaded = page.getByRole("region", { name: "Details for Skypiea" });
  await expect(reloaded.getByRole("listitem")).toHaveText([/Jaya/, /Upper Yard \(Enel\)/]);
  await expect(reloaded.getByRole("checkbox", { name: "Jaya" })).toBeChecked();
  await expect(reloaded.getByLabel("Due date", { exact: true })).toHaveValue(dueValue);
  await expect(reloaded.getByLabel("Notes", { exact: true })).toHaveValue("Watch the Skypiea arc before the movie.\nEpisodes 153–195.");
  await page.getByRole("button", { name: /^Completed/ }).click();
  await expect(page.getByRole("list", { name: "Arcs completed tasks" }).getByRole("checkbox", { name: "Alabasta" })).toBeChecked();

  // Reorder tasks with the keyboard, then delete one with its details (confirmed).
  await page.getByRole("button", { name: /^Enies Lobby/ }).focus();
  const moved = page.waitForResponse((response) => /\/api\/nodes\/[^/]+\/items$/.test(new URL(response.url()).pathname) && response.request().method() === "PUT");
  await page.keyboard.press("Alt+ArrowUp");
  await moved;
  const order = await page
    .getByRole("list", { name: "Arcs tasks" })
    .getByRole("checkbox")
    .evaluateAll((boxes) => boxes.filter((box) => !box.closest("[role=region]")).map((box) => box.getAttribute("aria-label")));
  expect(order).toEqual(["Skypiea", "Enies Lobby", "Water 7"]);
  page.once("dialog", (dialog) => void dialog.accept());
  await reloaded.getByRole("button", { name: "Delete task" }).click();
  await expect(page.getByRole("checkbox", { name: "Skypiea" })).toHaveCount(0);
});

test("saving problems are visible and recoverable", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  await signIn(page, E2E_USERS.desktop.email, E2E_USERS.desktop.password);
  await openEntry(page, "games", "Fortnite");
  let files = await explorer(page, false);
  await treeItem(files, "Guides", "note").locator("> div").click();
  const editor = noteEditor(page, "Guides");

  // Offline: the error is shown, the text stays, and Retry saves it.
  await page.route("**/api/nodes/*", (route) => (route.request().method() === "PATCH" ? route.abort("internetdisconnected") : route.continue()));
  await typeInEditor(page, editor, "Boss order: Hornet first.");
  await expect(page.getByRole("status").filter({ hasText: /Not saved/ })).toBeVisible();
  await expect(editor).toContainText("Boss order: Hornet first.");
  await page.unroute("**/api/nodes/*");
  const saved = nodeSaved(page);
  await page.getByRole("button", { name: "Retry" }).click();
  await saved;
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();

  // Another tab changes the same note: this tab is told instead of overwriting it.
  const other = await context.newPage();
  await other.goto(page.url());
  const otherEditor = noteEditor(other, "Guides");
  await expect(otherEditor).toContainText("Boss order: Hornet first.");
  const otherSaved = nodeSaved(other);
  await typeInEditor(other, otherEditor, "Written in the other tab.", { replace: true });
  await otherSaved;
  await other.close();

  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText(" Then the Mantis Lords.");
  await expect(page.getByRole("alert").filter({ hasText: "changed somewhere else" })).toBeVisible();
  const kept = nodeSaved(page);
  await page.getByRole("button", { name: "Keep my version" }).click();
  await kept;
  await page.reload();
  expect(await storedContent(page)).toBe("Boss order: Hornet first. Then the Mantis Lords.");

  // Task notes that fail to save stay in place with a retry.
  files = await explorer(page, false);
  await treeItem(files, "Checklist", "checklist").locator("> div").click();
  await page.getByRole("textbox", { name: "Add a task to Checklist" }).fill("Win a match");
  await page.getByRole("textbox", { name: "Add a task to Checklist" }).press("Enter");
  await page.getByRole("button", { name: /^Win a match/ }).click();
  const details = page.getByRole("region", { name: "Details for Win a match" });
  await page.route("**/api/items/*", (route) => (route.request().method() === "PATCH" ? route.abort("internetdisconnected") : route.continue()));
  await details.getByLabel("Notes", { exact: true }).fill("Land at Tilted Towers.");
  await expect(details.getByRole("status").filter({ hasText: /Not saved/ })).toBeVisible();
  await page.unroute("**/api/items/*");
  const retried = itemSaved(page);
  await details.getByRole("button", { name: "Retry" }).click();
  await retried;
  await expect(details.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /^Win a match/ }).click();
  await expect(page.getByRole("region", { name: "Details for Win a match" }).getByLabel("Notes", { exact: true })).toHaveValue("Land at Tilted Towers.");
});

test("motion: page entrances, hover effects, scroll exits and reduced motion", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  const user = userFor(project);
  // Record every entrance that actually starts, with the visual state a moment after it began.
  await page.addInitScript(() => {
    const entrances: { tag: string; duration: number; delay: number; from: { opacity: string; transform: string }; to: { opacity: string } }[] = [];
    Reflect.set(window, "archiveEntrances", entrances);
    document.addEventListener("animationstart", (event) => {
      if (event.animationName !== "archive-enter" || !(event.target instanceof HTMLElement)) return;
      const element = event.target;
      const animation = element.getAnimations().find((candidate) => (candidate as CSSAnimation).animationName === "archive-enter");
      const timing = animation?.effect?.getComputedTiming();
      const frames = (animation?.effect as KeyframeEffect | undefined)?.getKeyframes() ?? [];
      entrances.push({
        tag: element.tagName,
        duration: Number(timing?.duration ?? 0),
        delay: Number(timing?.delay ?? 0),
        from: { opacity: String(frames[0]?.opacity), transform: String(frames[0]?.transform) },
        to: { opacity: String(frames.at(-1)?.opacity) },
      });
    });
  });
  type Entrance = { tag: string; duration: number; delay: number; from: { opacity: string; transform: string }; to: { opacity: string } };
  const entrances = () => page.evaluate(() => Reflect.get(window, "archiveEntrances") as Entrance[]);
  const entranceCount = async () => (await entrances()).length;
  const idle = () =>
    expect
      .poll(() => page.evaluate(() => document.getAnimations().filter((animation) => (animation as CSSAnimation).animationName === "archive-enter" && animation.playState === "running").length))
      .toBe(0);

  await signIn(page, user.email, user.password);
  await idle();

  // Library cards really enter (the keyframes change opacity and position; they used to collide with
  // tw-animate-css's own `enter` and do nothing), quickly and with a short stagger.
  const cards = (await entrances()).filter((record) => record.tag === "LI");
  expect(cards.length).toBeGreaterThan(0);
  for (const card of cards) {
    expect(card.duration).toBeGreaterThanOrEqual(200);
    expect(card.duration).toBeLessThanOrEqual(400);
    expect(card.delay).toBeLessThanOrEqual(300);
    expect(card.from.opacity).toBe("0");
    expect(card.from.transform).toMatch(/translate/);
    expect(card.to.opacity).toBe("1");
  }
  const card = page.getByRole("list", { name: "Anime" }).getByRole("listitem").first();
  expect(await card.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");

  // Internal navigation plays entrances too, without a full page load.
  await page.evaluate(() => Reflect.set(window, "motionSession", "same-document"));
  const navigation = page.getByRole("navigation", { name: project === "mobile" ? "Primary" : "Collections" });
  const beforeGames = await entranceCount();
  await navigation.getByRole("link", { name: "Games", exact: true }).click();
  await expect(page).toHaveURL(/\/games$/);
  await expect.poll(entranceCount).toBeGreaterThan(beforeGames);
  await idle();

  // Game creation needs only a title: no platform anywhere.
  await page.getByRole("main").getByRole("link", { name: "New game" }).first().click();
  await expect(page).toHaveURL(/\/games\/new$/);
  await expect(page.getByLabel(/platform/i)).toHaveCount(0);
  await expect(page.getByLabel("Banner image URL")).toHaveCount(0);
  await page.getByRole("button", { name: /Add a banner image/ }).click();
  await expect(page.getByLabel("Banner image URL")).toBeVisible();
  await idle();
  await shot(page, project, "polished-game-creation", false);
  await page.getByLabel("Title").fill("Motion game");
  await page.getByRole("button", { name: "Create game" }).click();
  await expect(page).toHaveURL(/\/games\/[0-9a-f-]{36}(\?|$)/);
  await expect(page.getByRole("heading", { name: "Motion game", exact: true })).toBeVisible();
  const titleOnlyGameId = new URL(page.url()).pathname.split("/")[2];
  const { data: titleOnlyGame } = await adminClient().from("entries").select("platform, cover_url, banner_url").eq("id", titleOnlyGameId).single();
  expect(titleOnlyGame).toEqual({ platform: null, cover_url: null, banner_url: null });
  await navigation.getByRole("link", { name: "Games", exact: true }).click();
  await expect(page.getByRole("list", { name: "Games" }).getByRole("listitem")).toHaveCount(2);
  await idle();
  await shot(page, project, "polished-library-games", false);
  await navigation.getByRole("link", { name: "Anime", exact: true }).click();
  await expect(page).toHaveURL(/\/anime$/);
  await idle();
  expect(await page.evaluate(() => Reflect.get(window, "motionSession"))).toBe("same-document");

  // Hover: lift, scale and artwork zoom with transforms only, so the grid never shifts.
  const libraryLink = card.getByRole("link");
  const layoutBefore = await card.evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight, top: (element as HTMLElement).offsetTop }));
  if (project === "desktop") {
    await libraryLink.hover();
    await expect.poll(() => libraryLink.evaluate((element) => getComputedStyle(element).translate)).toBe("0px -8px");
    await expect.poll(() => libraryLink.evaluate((element) => Number(getComputedStyle(element).scale))).toBeGreaterThan(1.04);
    await expect.poll(() => libraryLink.locator(".poster-artwork").evaluate((element) => Number(getComputedStyle(element).scale))).toBeGreaterThan(1.08);
    await expect.poll(() => libraryLink.locator(".poster-frame").evaluate((element) => getComputedStyle(element).boxShadow)).toContain("rgba(165, 124, 255");
    await shot(page, project, "polished-card-hover", false);
    await page.mouse.move(1, 1);
    await expect.poll(() => libraryLink.evaluate((element) => getComputedStyle(element).translate)).toBe("none");
    const newButton = page.getByRole("main").getByRole("link", { name: "New anime" }).first();
    await newButton.hover();
    await expect.poll(() => newButton.evaluate((element) => getComputedStyle(element).translate)).toBe("0px -1px");
    await expect.poll(() => newButton.evaluate((element) => getComputedStyle(element).boxShadow)).toContain("rgba(165, 124, 255");
    await page.mouse.down();
    await expect.poll(() => newButton.evaluate((element) => Number(getComputedStyle(element).scale))).toBeLessThan(0.99);
    await page.mouse.move(1, 1);
    await page.mouse.up();
  } else {
    expect(await libraryLink.evaluate((element) => getComputedStyle(element).translate)).toBe("none");
  }
  expect(await card.evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight, top: (element as HTMLElement).offsetTop }))).toEqual(layoutBefore);

  // Filters form one aligned toolbar and never replay the page entrance.
  const beforeFilters = await entranceCount();
  const sort = page.getByRole("combobox", { name: "Sort", exact: true });
  await sort.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(sort).toBeFocused();
  await expect.poll(() => sort.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe("none");
  await sort.press("Space");
  await expect(page.getByRole("option", { name: "Recently active" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("option", { name: "Most progress" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/sort=progress/);
  await expect(sort).toContainText("Most progress");
  await page.getByLabel("Search Anime").fill("One");
  await page.getByLabel("Search Anime").press("Enter");
  await expect(page).toHaveURL(/q=One/);
  await expect(libraryLink).toBeVisible();
  expect(await entranceCount()).toBe(beforeFilters);

  const alignment = await page.evaluate(() => {
    const controls = Array.from(document.querySelectorAll("form[role=search], [role=combobox], a[aria-label='Clear filters']"));
    return controls.map((element) => {
      const rect = element.getBoundingClientRect();
      const value = element.querySelector("[data-slot=select-value]")?.getBoundingClientRect();
      return { height: rect.height, top: rect.top, right: rect.right, valueInside: !value || (value.top >= rect.top && value.bottom <= rect.bottom) };
    });
  });
  expect(alignment).toHaveLength(4);
  for (const control of alignment) {
    expect(control.height).toBe(40);
    expect(control.valueInside).toBe(true);
  }
  expect(alignment[1].top).toBe(alignment[2].top);
  if (project === "desktop") expect(new Set(alignment.map((control) => control.top)).size).toBe(1);
  else expect(Math.abs(alignment[3].right - alignment[0].right)).toBeLessThanOrEqual(1);
  await assertLayoutAndA11y(page);
  await shot(page, project, "polished-filters", false);
  if (project === "mobile") {
    const viewport = page.viewportSize()!;
    await page.setViewportSize({ width: 320, height: 720 });
    await assertLayoutAndA11y(page);
    await shot(page, project, "polished-filters-narrow", false);
    await page.setViewportSize(viewport);
  }
  await page.getByRole("link", { name: "Clear filters", exact: true }).click();
  await expect(page).toHaveURL(/\/anime$/);
  await expect(libraryLink).toBeVisible();
  expect(await entranceCount()).toBe(beforeFilters);

  // The workspace header shrinks and fades as it scrolls away; it is never sticky.
  await openEntry(page, "anime", "One Piece");
  const header = page.getByTestId("entry-header");
  expect(await header.evaluate((element) => getComputedStyle(element).position)).toBe("static");
  const opacity = () => header.evaluate((element) => Number(getComputedStyle(element).opacity));
  await expect.poll(opacity).toBeGreaterThan(0.99);
  await page.evaluate(() => window.scrollBy(0, 220));
  await expect.poll(opacity).toBeLessThan(0.95);
  expect(await header.evaluate((element) => getComputedStyle(element).transform)).not.toBe("none");
  await shot(page, project, "scrolled", false);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(opacity).toBeGreaterThan(0.99);

  // Typing and autosaving never replay entrances.
  const files = await explorer(page, project === "mobile");
  await treeItem(files, "Live preview", "note").locator("> div").click();
  const editor = noteEditor(page, "Live preview");
  await idle();
  const beforeTyping = await entranceCount();
  const typingSaved = nodeSaved(page);
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText(" typing");
  await typingSaved;
  await expect(editor).toBeFocused();
  expect(await entranceCount()).toBe(beforeTyping);

  // Reduced motion: no entrance, scroll-linked or hover movement, and content stays visible.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/anime");
  const calmCard = page.getByRole("list", { name: "Anime" }).getByRole("listitem").first();
  expect(await calmCard.evaluate((element) => [getComputedStyle(element).animationName, getComputedStyle(element).opacity])).toEqual(["none", "1"]);
  await calmCard.getByRole("link").hover();
  expect(await calmCard.getByRole("link").evaluate((element) => [getComputedStyle(element).translate, getComputedStyle(element).scale])).toEqual(["none", "none"]);
  await assertLayoutAndA11y(page);
  await shot(page, project, "polished-reduced-motion", false);
  await openEntry(page, "anime", "One Piece");
  await page.evaluate(() => window.scrollBy(0, 220));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  expect(await header.evaluate((element) => [getComputedStyle(element).opacity, getComputedStyle(element).transform])).toEqual(["1", "none"]);
});
