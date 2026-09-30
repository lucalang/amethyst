import { expect, type Locator, type Page } from "@playwright/test";

export { E2E_USERS } from "./global-setup";

const MAILPIT = "http://127.0.0.1:54324";

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/anime$/);
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login\?notice=signed-out/);
}

/** Latest email to `to` whose subject matches, from the local Mailpit inbox. */
export async function waitForEmail(to: string, subject: RegExp): Promise<string> {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
        const body = (await response.json()) as { messages: { ID: string; Subject: string }[] };
        id = body.messages.find((message) => subject.test(message.Subject))?.ID;
        return Boolean(id);
      },
      { timeout: 20_000, message: `email to ${to} matching ${subject}` },
    )
    .toBe(true);
  const message = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as { HTML: string };
  return message.HTML;
}

/** Path of the /auth/confirm link in an email (the site URL differs from the test server). */
export function confirmLink(html: string): string {
  const match = html.match(/href="([^"]*\/auth\/confirm\?[^"]*)"/);
  if (!match) throw new Error("no confirmation link in email");
  const url = new URL(match[1].replaceAll("&amp;", "&"));
  return `${url.pathname}${url.search}`;
}

/** The explorer: a side panel on desktop, a sheet opened from "Files" on small screens. */
export async function explorer(page: Page, mobile: boolean): Promise<Locator> {
  if (!mobile) return page.getByRole("complementary", { name: "Explorer" });
  const sheet = page.getByRole("dialog", { name: "Files" });
  if (!(await sheet.isVisible())) await page.getByRole("button", { name: "Files", exact: true }).click();
  await expect(sheet).toBeVisible();
  return sheet;
}

export function treeItem(scope: Locator, name: string, kind: "folder" | "note" | "checklist") {
  return scope.getByRole("treeitem", { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}, ${kind}`) });
}

export function rowActions(scope: Locator, name: string) {
  return scope.getByRole("button", { name: `Actions for ${name}`, exact: true });
}

/** Resolves when an autosave (or other change) to a workspace node has been accepted. */
export function nodeSaved(page: Page) {
  return page.waitForResponse((response) => /\/api\/nodes\/[^/]+$/.test(new URL(response.url()).pathname) && response.request().method() === "PATCH" && response.ok());
}

/** Resolves when a task (checklist item) change has been accepted. */
export function itemSaved(page: Page) {
  return page.waitForResponse((response) => /\/api\/items\/[^/]+$/.test(new URL(response.url()).pathname) && response.request().method() === "PATCH" && response.ok());
}

export function noteEditor(page: Page, name: string) {
  return page.getByRole("textbox", { name: `Contents of ${name}` });
}

/**
 * Press Enter in the live editor and wait for the new line. CodeMirror applies Enter
 * asynchronously on Android, so typing straight on could race it in mobile emulation.
 */
export async function newLine(page: Page, editor: Locator) {
  const lines = editor.locator(".cm-line");
  const before = await lines.count();
  await page.keyboard.press("Enter");
  await expect(lines).toHaveCount(before + 1);
}

/** Type into the live editor line by line (Enter between lines), like a person would. */
export async function typeInEditor(page: Page, editor: Locator, text: string, options: { replace?: boolean } = {}) {
  await editor.click();
  if (options.replace) {
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Delete");
  }
  for (const [index, line] of text.split("\n").entries()) {
    if (index > 0) await newLine(page, editor);
    if (line) await page.keyboard.insertText(line);
  }
}

/** Markdown stored on the server for the open file. */
export async function storedContent(page: Page): Promise<string> {
  const id = new URL(page.url()).searchParams.get("file");
  const response = await page.request.get(`/api/nodes/${id}`);
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { node: { content: string } }).node.content;
}

/** Fail on horizontal overflow and on interactive elements without an accessible name. */
export async function assertLayoutAndA11y(page: Page) {
  const report = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const unnamed = Array.from(document.querySelectorAll("button, a[href], [role=checkbox], [role=treeitem], [role=textbox], input:not([type=hidden]), select, textarea"))
      .filter((element) => {
        const el = element as HTMLElement;
        if (el.closest("[aria-hidden=true]") || el.offsetParent === null) return false;
        const labelledBy = el.getAttribute("aria-labelledby");
        const name =
          el.getAttribute("aria-label") ||
          (labelledBy && document.getElementById(labelledBy)?.textContent) ||
          (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent) ||
          el.closest("label")?.textContent ||
          el.textContent ||
          el.getAttribute("title") ||
          (el as HTMLInputElement).placeholder;
        return !name || !name.trim();
      })
      .map((element) => element.outerHTML.slice(0, 120));
    return { overflow, unnamed };
  });
  expect(report.overflow, "page must not scroll horizontally").toBeLessThanOrEqual(1);
  expect(report.unnamed, "interactive elements need accessible names").toEqual([]);
}
