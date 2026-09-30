import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient, type ServerSupabase } from "./server";

export type AuthContext = {
  supabase: ServerSupabase;
  userId: string;
  email: string | null;
};

/**
 * Verifies the session JWT (signature checked by getClaims) and returns a
 * user-scoped client. Ownership is always derived from these claims.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || typeof sub !== "string" || !sub) return null;
  const email = data?.claims?.email;
  return { supabase, userId: sub, email: typeof email === "string" ? email : null };
});

export async function requireUser(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** Idempotently create the profile row after verified authentication. */
export async function ensureProfile(ctx: AuthContext): Promise<boolean> {
  const { error } = await ctx.supabase.rpc("ensure_profile");
  // 23503: the auth account behind a still-valid token no longer exists.
  if (error?.code === "23503") return false;
  if (error) throw new Error(`Could not create profile: ${error.message}`);
  return true;
}
