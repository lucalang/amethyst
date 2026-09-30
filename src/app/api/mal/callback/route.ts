import { after, NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/supabase/auth";
import { completeMalAuthorization } from "@/lib/sync/connection.server";
import { pokeWorker } from "@/lib/worker/poke";

const NO_STORE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

export async function GET(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.redirect(new URL("/login?next=/sync", request.url), { headers: NO_STORE });

  const outcome = await completeMalAuthorization(ctx, request.nextUrl.searchParams);
  if (outcome === "connected") after(pokeWorker);
  // Redirect without the code/state so they never linger in history or logs.
  return NextResponse.redirect(new URL(`/sync?mal=${outcome}`, request.url), { headers: NO_STORE });
}
