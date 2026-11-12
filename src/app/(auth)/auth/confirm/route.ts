import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/validation/redirect";

const ALLOWED_TYPES = new Set<EmailOtpType>(["email", "signup", "magiclink", "invite", "recovery"]);

// Verifies email links (sign-up confirmation, magic link, invite, recovery) server-side.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  const failure = new URL("/login", request.url);
  failure.searchParams.set("error", "link");

  const supabase = await createClient();

  // PKCE flow (modern): the proxy middleware already exchanged the code for a session.
  if (code && type && ALLOWED_TYPES.has(type) && !tokenHash) {
    const { data } = await supabase.auth.getClaims();
    if (data?.claims?.sub) {
      await supabase.rpc("ensure_profile");
      return NextResponse.redirect(new URL(next, request.url), { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.redirect(failure, { headers: { "Cache-Control": "no-store" } });
  }

  // OTP flow (legacy): custom email template with a token_hash.
  if (!tokenHash || !type || !ALLOWED_TYPES.has(type) || tokenHash.length > 512) {
    return NextResponse.redirect(failure, { headers: { "Cache-Control": "no-store" } });
  }

  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    return NextResponse.redirect(failure, { headers: { "Cache-Control": "no-store" } });
  }
  await supabase.rpc("ensure_profile");

  return NextResponse.redirect(new URL(next, request.url), { headers: { "Cache-Control": "no-store" } });
}
