import { existsSync, readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** Test settings: `.env.test.local` if present (so `.env.local` may point at production), else `.env.local`. */
export function loadLocalEnv(): Record<string, string> {
  const file = existsSync(".env.test.local") ? ".env.test.local" : ".env.local";
  const env: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const index = line.indexOf("=");
    if (index > 0 && !line.startsWith("#")) env[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  const host = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "http://invalid").hostname;
  // Tests create and delete users; never let them touch a hosted project.
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Tests only run against a local Supabase, but ${file} points at ${host}. Create .env.test.local with the values from \`npx supabase status\`.`);
  }
  return env;
}

export const env = loadLocalEnv();
export const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;

export function adminClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type TestUser = { id: string; email: string; password: string; client: SupabaseClient<Database> };

export async function createTestUser(label: string): Promise<TestUser> {
  const admin = adminClient();
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const password = `Pw-${Math.random().toString(36).slice(2)}-123456`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  const { error: profileError } = await client.rpc("ensure_profile");
  if (profileError) throw profileError;
  return { id: data.user.id, email, password, client };
}

export async function deleteTestUser(user: TestUser | undefined) {
  if (user) await adminClient().auth.admin.deleteUser(user.id);
}
