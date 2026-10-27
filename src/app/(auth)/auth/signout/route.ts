import { NextResponse, type NextRequest } from "next/server";
import { rejectCrossOrigin } from "@/lib/http";
import { STARTUP_COOKIE } from "@/lib/startup";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const supabase = await createClient();
  await supabase.auth.signOut();
  const response = NextResponse.redirect(new URL("/login?notice=signed-out", request.url), {
    status: 303,
    // Drops cached private image redirects so the next account on this browser never reuses them.
    headers: { "Cache-Control": "no-store", "Clear-Site-Data": '"cache"' },
  });
  response.cookies.delete(STARTUP_COOKIE);
  return response;
}
