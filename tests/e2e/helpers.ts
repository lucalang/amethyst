import { expect, type Page } from "@playwright/test";
import { runWorker } from "../../src/lib/worker/run";
import { workerConfigFromEnv } from "../../src/lib/worker/config";
import { adminClient, env } from "../support/local-supabase";
import { MOCK_ORIGIN } from "../support/mock-server";

export { E2E_USERS } from "./global-setup";

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** Process due jobs/outbox with the production worker code against the mock providers. */
export async function runE2EWorker() {
  const config = workerConfigFromEnv(
    (name) =>
      ({
        JIKAN_BASE_URL: `${MOCK_ORIGIN}/v4`,
        JIKAN_INTERVAL_MS: "0",
        MAL_INTERVAL_MS: "0",
        MAL_CLIENT_ID: "e2e-client-id",
        MAL_TOKEN_URL: `${MOCK_ORIGIN}/mal/v1/oauth2/token`,
        MAL_API_BASE_URL: `${MOCK_ORIGIN}/mal/v2`,
        TOKEN_ENCRYPTION_KEY: env.TOKEN_ENCRYPTION_KEY,
        WORKER_BUDGET_MS: "30000",
      })[name],
    `e2e-${process.pid}`,
  );
  return runWorker(adminClient(), config, { fetch: globalThis.fetch.bind(globalThis), sleep: async () => undefined, now: Date.now });
}

export async function makeOutboxDue() {
  await adminClient().from("sync_outbox").update({ not_before: new Date(Date.now() - 1000).toISOString() }).eq("state", "pending");
}

export async function mockState(): Promise<{ patches: { id: number; body: Record<string, string> }[] }> {
  return (await fetch(`${MOCK_ORIGIN}/__state`)).json();
}

export async function resetMalMock() {
  await fetch(`${MOCK_ORIGIN}/__reset`, { method: "POST" });
}

/** Fail on horizontal overflow and on interactive elements without an accessible name. */
export async function assertLayoutAndA11y(page: Page) {
  const report = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const unnamed = Array.from(document.querySelectorAll("button, a[href], [role=checkbox], input:not([type=hidden]), select, textarea"))
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
