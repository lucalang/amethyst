import { NextResponse, type NextRequest } from "next/server";
import { malConfig } from "@/lib/env";
import { getAuthContext } from "@/lib/supabase/auth";
import { startMalAuthorization } from "@/lib/sync/connection.server";

const NO_STORE = { "Cache-Control": "no-store" };

// Starts the separate "Connect MyAnimeList" flow (not a sign-in method).
export async function GET(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.redirect(new URL("/login?next=/settings", request.url), { headers: NO_STORE });
  if (!malConfig()) return NextResponse.redirect(new URL("/sync?mal=not_configured", request.url), { headers: NO_STORE });

  const authorizeUrl = await startMalAuthorization(ctx.userId);
  return NextResponse.redirect(authorizeUrl, { headers: NO_STORE });
}
