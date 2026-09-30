"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/validation/redirect";

export type LoginState = { status: "idle" | "error" | "sent"; message?: string; email?: string };

const passwordSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(200),
  next: z.string().optional(),
});

export async function signInWithPassword(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = passwordSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { status: "error", message: "Enter a valid email and password.", email: String(formData.get("email") ?? "") };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { status: "error", message: "Invalid email or password.", email: parsed.data.email };

  const { error: profileError } = await supabase.rpc("ensure_profile");
  if (profileError) return { status: "error", message: "Signed in, but your profile could not be created. Try again." };

  redirect(safeNextPath(parsed.data.next));
}

const magicSchema = z.object({ email: z.email().max(320) });

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = magicSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { status: "error", message: "Enter a valid email address." };

  const supabase = await createClient();
  // shouldCreateUser: false — magic links never create accounts (invite-only).
  await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { shouldCreateUser: false, emailRedirectTo: `${serverEnv().APP_URL}/auth/confirm` },
  });
  // Same response whether or not the account exists, to avoid enumeration.
  return { status: "sent", message: "If an account exists for that address, a sign-in link is on its way." };
}
