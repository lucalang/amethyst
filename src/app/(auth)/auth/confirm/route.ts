import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/validation/redirect";

const ALLOWED_TYPES = new Set<EmailOtpType>(["email", "magiclink", "invite", "recovery"]);

// Verifies email links (magic link, invite, recovery) server-side.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));

  const failure = new URL("/login", request.url);
  failure.searchParams.set("error", "link");

  if (!tokenHash || !type || !ALLOWED_TYPES.has(type) || tokenHash.length > 512) {
    return NextResponse.redirect(failure, { headers: { "Cache-Control": "no-store" } });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    return NextResponse.redirect(failure, { headers: { "Cache-Control": "no-store" } });
  }
  await supabase.rpc("ensure_profile");

  return NextResponse.redirect(new URL(next, request.url), { headers: { "Cache-Control": "no-store" } });
}
