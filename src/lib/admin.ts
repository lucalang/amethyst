import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { NextResponse } from "next/server";
import { apiError, requireApiUser } from "@/lib/http";
import { requireUser, type AuthContext } from "@/lib/supabase/auth";

/**
 * Administrators are listed in public.app_admins, which only the service role can change. This check
 * decides what to show; every admin database function verifies the list again on its own.
 */
export const isAdmin = cache(async (ctx: AuthContext): Promise<boolean> => {
  const { data, error } = await ctx.supabase.from("app_admins").select("user_id").eq("user_id", ctx.userId).maybeSingle();
  return !error && data !== null;
});

/** Admin pages answer 404 to everyone else, so they don't reveal that the panel exists. */
export async function requireAdminPage(): Promise<AuthContext> {
  const ctx = await requireUser();
  if (!(await isAdmin(ctx))) notFound();
  return ctx;
}

export async function requireAdminApi(): Promise<AuthContext | NextResponse> {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  return (await isAdmin(ctx)) ? ctx : apiError(404, "not_found", "Not found.");
}
