"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/validation/redirect";

export type AuthState = {
  status: "idle" | "error" | "success" | "unconfirmed";
  message?: string;
  email?: string;
  fieldErrors?: Record<string, string>;
};

const emailSchema = z.email("Enter a valid email address.").max(320);

/** Mirrors the Supabase password policy (minimum_password_length, letters_digits). */
const newPasswordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(128, "Use at most 128 characters.")
  .regex(/[A-Za-z]/, "Include at least one letter.")
  .regex(/\d/, "Include at least one digit.");

const confirmUrl = (next: string) => `${serverEnv().APP_URL}/auth/confirm?next=${encodeURIComponent(next)}`;

function destination(next: unknown) {
  const path = safeNextPath(next);
  return path === "/" ? "/anime" : path;
}

export async function signInWithPassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const parsed = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password.").max(200) }).safeParse({
    email,
    password: formData.get("password"),
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Enter your email and password.", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { status: "unconfirmed", message: "Confirm your email address first. Use the link we sent when you signed up.", email };
    }
    if (error.status === 429) return { status: "error", message: "Too many attempts. Wait a moment and try again.", email };
    return { status: "error", message: "Invalid email or password.", email };
  }

  const { error: profileError } = await supabase.rpc("ensure_profile");
  if (profileError) return { status: "error", message: "Signed in, but your profile could not be created. Try again.", email };
  redirect(destination(formData.get("next")));
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const parsed = z
    .object({ email: emailSchema, password: newPasswordSchema, confirm: z.string() })
    .refine((value) => value.password === value.confirm, { message: "Passwords do not match.", path: ["confirm"] })
    .safeParse({ email, password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { status: "error", message: "Check the highlighted fields.", fieldErrors, email };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: confirmUrl("/anime") },
  });
  if (error) {
    if (error.code === "weak_password") return { status: "error", message: error.message, fieldErrors: { password: error.message }, email };
    if (error.code === "signup_disabled") return { status: "error", message: "Registration is currently closed.", email };
    if (error.status === 429) return { status: "error", message: "Too many sign-up emails were sent. Try again later.", email };
    return { status: "error", message: "Could not create the account. Try again.", email };
  }

  if (data.session) {
    // Email confirmation is disabled in this environment: the account is ready.
    await supabase.rpc("ensure_profile");
    redirect("/anime");
  }
  // Same answer whether or not the address was already registered (no account enumeration).
  return { status: "success", message: `We sent a confirmation link to ${parsed.data.email}. Open it to activate your account.`, email };
}

export async function resendConfirmation(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { status: "error", message: "Enter a valid email address." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email: parsed.data, options: { emailRedirectTo: confirmUrl("/anime") } });
  if (error?.status === 429) return { status: "error", message: "Please wait a moment before requesting another email.", email: parsed.data };
  return { status: "success", message: "If that account still needs confirming, a new link is on its way.", email: parsed.data };
}

export async function requestPasswordReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { status: "error", message: "Enter a valid email address." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: confirmUrl("/settings/password") });
  if (error?.status === 429) return { status: "error", message: "Please wait a moment before requesting another email.", email: parsed.data };
  return { status: "success", message: "If an account exists for that address, a password reset link is on its way.", email: parsed.data };
}

export async function sendMagicLink(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { status: "error", message: "Enter a valid email address." };
  const supabase = await createClient();
  // Magic links only sign in existing accounts; registration uses the sign-up form.
  await supabase.auth.signInWithOtp({ email: parsed.data, options: { shouldCreateUser: false, emailRedirectTo: confirmUrl("/anime") } });
  return { status: "success", message: "If an account exists for that address, a sign-in link is on its way.", email: parsed.data };
}
