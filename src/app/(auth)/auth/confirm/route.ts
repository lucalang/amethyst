import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/validation/redirect";

const ALLOWED_TYPES = new Set<EmailOtpType>(["email", "signup", "magiclink", "invite", "recovery"]);
const RESET_PATH = "/auth/reset-password";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Verifies email links (sign-up confirmation, magic link, invite, password recovery) server-side and stores the
 * resulting session in cookies before redirecting. Two link formats arrive here:
 * - PKCE (Supabase's default `{{ .ConfirmationURL }}` template, used by the hosted project): Supabase verifies the
 *   token itself, then redirects to our `redirectTo` with `?code=…` appended. The code is exchanged here, using
 *   the code verifier cookie written when the email was requested. Supabase adds no `type` to this redirect, so
 *   the intent comes from our own `type`/`next` parameters.
 * - Token hash (the custom templates in supabase/templates): `?token_hash=…&type=…`, verified with verifyOtp.
 * Tokens and codes are never logged or forwarded.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const type = rawType && ALLOWED_TYPES.has(rawType as EmailOtpType) ? (rawType as EmailOtpType) : null;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));
  const recovery = type === "recovery" || next === RESET_PATH;

  const redirect = (path: string) => NextResponse.redirect(new URL(path, request.url), { headers: NO_STORE });
  // A recovery link that can't be used gets its own page with a way to request a new email.
  const fail = () => redirect(recovery ? `${RESET_PATH}?error=link` : "/login?error=link");
  const succeed = () => redirect(recovery ? RESET_PATH : next);

  const supabase = await createClient();

  if (code && !tokenHash) {
    if (code.length > 512) return fail();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail();
    await supabase.rpc("ensure_profile");
    return succeed();
  }

  if (!tokenHash || !type || tokenHash.length > 512) return fail();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return fail();
  await supabase.rpc("ensure_profile");
  return succeed();
}
