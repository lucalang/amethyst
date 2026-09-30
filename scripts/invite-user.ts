/**
 * Invite-only account provisioning (public signup is disabled).
 *
 *   npm run user:invite -- --email person@example.com            # emails an invite link
 *   npm run user:invite -- --email person@example.com --password  # prompts for a password (local/dev)
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (.env.local).
 */
import { createInterface } from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";

function arg(name: string): string | true | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : true;
}

async function promptHidden(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const answer = await rl.question(question);
  rl.close();
  return answer;
}

async function main() {
  const email = arg("email");
  if (typeof email !== "string") throw new Error("Usage: --email <address> [--password]");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");

  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const passwordFlag = arg("password");

  if (passwordFlag) {
    const password = typeof passwordFlag === "string" ? passwordFlag : await promptHidden("Password: ");
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    console.log(`Created ${data.user.email} (${data.user.id}).`);
  } else {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
    if (error) throw error;
    console.log(`Invitation sent to ${data.user.email}.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
