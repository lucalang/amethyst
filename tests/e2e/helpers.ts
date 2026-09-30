import { expect, type Locator, type Page } from "@playwright/test";

export { E2E_USERS } from "./global-setup";

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
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

/** Fail on horizontal overflow and on interactive elements without an accessible name. */
export async function assertLayoutAndA11y(page: Page) {
  const report = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const unnamed = Array.from(document.querySelectorAll("button, a[href], [role=checkbox], [role=treeitem], input:not([type=hidden]), select, textarea"))
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
