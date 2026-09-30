import { mkdirSync } from "node:fs";
import { adminClient } from "../support/local-supabase";

export const E2E_USERS = {
  desktop: { email: "e2e-desktop@test.local", password: "E2e-desktop-password-1" },
  mobile: { email: "e2e-mobile@test.local", password: "E2e-mobile-password-1" },
  intruder: { email: "e2e-intruder@test.local", password: "E2e-intruder-password-1" },
};

export default async function globalSetup() {
  const admin = adminClient();
  // Fresh users each run so journeys are deterministic.
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const user of data.users) {
    if (user.email?.startsWith("e2e-")) await admin.auth.admin.deleteUser(user.id);
  }
  for (const user of Object.values(E2E_USERS)) {
    const { error } = await admin.auth.admin.createUser({ email: user.email, password: user.password, email_confirm: true });
    if (error) throw error;
  }
  mkdirSync("tests/e2e/screenshots", { recursive: true });
}
