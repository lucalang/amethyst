import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Clears a session whose JWT is still valid but whose account no longer exists
// (e.g. removed by an administrator). Live accounts are never signed out here.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) await supabase.auth.signOut({ scope: "local" });
  const target = new URL(data.user ? "/" : "/login?error=session", request.url);
  return NextResponse.redirect(target, { headers: { "Cache-Control": "no-store" } });
}
