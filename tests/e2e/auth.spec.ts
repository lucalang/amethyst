import { expect, test } from "@playwright/test";
import { E2E_USERS, assertLayoutAndA11y, confirmLink, signIn, signOut, waitForEmail } from "./helpers";

test.describe.configure({ mode: "serial" });

// Accounts created here start with "e2e-" so global setup removes them on the next run.
const stamp = Date.now();
const newcomer = { email: `e2e-reg-${stamp}@test.local`, password: "Amethyst-2026-first", reset: "Amethyst-2026-second" };

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop" && !testInfo.title.includes("layout"), "auth flows run once; layout runs everywhere");
});

test("auth pages layout", async ({ page }, testInfo) => {
  await page.goto("/login");
  await expect(page).toHaveTitle("Sign in · Amethyst Archives");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
  await expect(page.getByText("Amethyst Archives").first()).toBeVisible();
  await assertLayoutAndA11y(page);
  await page.screenshot({ path: `tests/e2e/screenshots/${testInfo.project.name}-login.png`, fullPage: true });
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page).toHaveTitle("Create account · Amethyst Archives");
  await assertLayoutAndA11y(page);
});

test("public registration requires a verified email", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Email").fill(newcomer.email);
  await page.getByLabel("Password", { exact: true }).fill("short1");
  await page.getByLabel("Confirm password").fill("short1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Check the highlighted fields.")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("Email").fill(newcomer.email);
  await page.getByLabel("Password", { exact: true }).fill(newcomer.password);
  await page.getByLabel("Confirm password").fill(newcomer.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Check your inbox")).toBeVisible();

  // Signing in before confirming explains what to do instead of failing silently.
  await page.goto("/login");
  await page.getByLabel("Email").fill(newcomer.email);
  await page.getByLabel("Password").fill(newcomer.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Confirm your email address first.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Resend confirmation email" })).toBeVisible();

  const email = await waitForEmail(newcomer.email, /Confirm your Amethyst Archives account/);
  await page.goto(confirmLink(email));
  await expect(page).toHaveURL(/\/anime$/);
  await expect(page.getByRole("heading", { name: "No anime yet" })).toBeVisible();

  // A used link cannot be replayed.
  await signOut(page);
  await expect(page.getByText("You have been signed out.")).toBeVisible();
  await page.goto(confirmLink(email));
  await expect(page).toHaveURL(/\/login\?error=link/);
  await expect(page.getByText("That link is invalid or has expired.")).toBeVisible();

  // The session persists across reloads until sign-out.
  await signIn(page, newcomer.email, newcomer.password);
  await page.reload();
  await expect(page).toHaveURL(/\/anime$/);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/anime$/);
});

test("password reset by email", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel("Email").fill(newcomer.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("If an account exists for that address, a password reset link is on its way.")).toBeVisible();

  const email = await waitForEmail(newcomer.email, /Reset your Amethyst Archives password/);
  await page.goto(confirmLink(email));
  await expect(page).toHaveURL(/\/settings\/password$/);
  await page.getByLabel("New password").fill(newcomer.reset);
  await page.getByLabel("Confirm password").fill(newcomer.reset);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText("Password updated.")).toBeVisible();
  await signOut(page);

  await page.getByLabel("Email").fill(newcomer.email);
  await page.getByLabel("Password").fill(newcomer.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
  await signIn(page, newcomer.email, newcomer.reset);
});

test("new accounts are isolated from each other", async ({ page, browser }) => {
  await signIn(page, newcomer.email, newcomer.reset);
  await page.goto("/anime/new");
  await page.getByLabel("Title").fill("Newcomer secret anime");
  await page.getByRole("button", { name: "Create anime" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Newcomer secret anime" })).toBeVisible();
  const secretUrl = new URL(page.url()).pathname;
  const entryId = secretUrl.split("/").pop()!;

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signIn(otherPage, E2E_USERS.intruder.email, E2E_USERS.intruder.password);
  await expect(otherPage.getByRole("link", { name: /Newcomer secret anime/ })).toHaveCount(0);
  await otherPage.goto(secretUrl);
  await expect(otherPage.getByRole("heading", { name: "Not found" })).toBeVisible();
  expect((await otherPage.request.get(`/api/entries/${entryId}/nodes`)).status()).toBe(404);
  await other.close();
});
