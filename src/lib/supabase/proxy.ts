import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { STARTUP_COOKIE, STARTUP_PATH, startupCookieOptions } from "@/lib/startup";
import { isBrowserDemoPath } from "@/lib/browser-version-demos";
import { GUEST_HOME, GUEST_INFO, guestMayCall, guestMayOpen } from "@/lib/guest";
import type { Database } from "./database.types";

const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/auth/confirm", "/auth/reset-password", "/auth/signout", "/auth/session-expired", "/tour"];
// Signed-in visitors skip these and go straight to their library.
const GUEST_ONLY_PATHS = new Set(["/login", "/register", "/forgot-password"]);

function isPublic(pathname: string) {
  return pathname === "/version-history" || pathname === "/whats-new" ||
    isBrowserDemoPath(pathname) ||
    /^\/whats-new\/[^/]+$/.test(pathname) ||
    PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Refreshes the Supabase session cookie and redirects anonymous visitors away
 * from vault pages. API routes are not redirected: every handler verifies the
 * session itself and answers 401.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const guest = signedIn && data?.claims?.is_anonymous === true;
  const { pathname, search } = request.nextUrl;

  if (!signedIn && !pathname.startsWith("/api/") && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    return withSessionCookies(NextResponse.redirect(url), response);
  }

  // Guests keep to the Arcade; they may still reach sign-in and sign-up to get a real account.
  if (guest) {
    if (pathname.startsWith("/api/")) {
      if (guestMayCall(pathname)) return response;
      return withSessionCookies(NextResponse.json({ error: { code: "guest", message: "This needs an account. Guests can only use the Arcade." } }, { status: 403 }), response);
    }
    if (isPublic(pathname) || guestMayOpen(pathname)) return response;
    const url = request.nextUrl.clone();
    url.search = "";
    if (pathname === "/") url.pathname = GUEST_HOME;
    else {
      url.pathname = GUEST_INFO;
      url.searchParams.set("from", pathname);
    }
    return withSessionCookies(NextResponse.redirect(url), response);
  }

  if (signedIn && GUEST_ONLY_PATHS.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return withSessionCookies(NextResponse.redirect(url), response);
  }

  // The first page of a browser session: opening Home goes to the startup destination chosen in Settings.
  if (signedIn && !pathname.startsWith("/api/") && !isPublic(pathname) && !request.cookies.has(STARTUP_COOKIE)) {
    const opening = pathname === "/" && request.method === "GET" && request.headers.get("sec-fetch-dest") === "document";
    const target = opening ? withSessionCookies(NextResponse.redirect(new URL(STARTUP_PATH, request.url)), response) : response;
    target.cookies.set(STARTUP_COOKIE, "1", startupCookieOptions(request.nextUrl.protocol === "https:"));
    return target;
  }

  return response;
}

function withSessionCookies(target: NextResponse, source: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = source.headers.get(header);
    if (value) target.headers.set(header, value);
  }
  return target;
}
