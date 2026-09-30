import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { serverEnv } from "@/lib/env";
import { getAuthContext, type AuthContext } from "@/lib/supabase/auth";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export function jsonResponse(data: unknown, init: ResponseInit = {}) {
  return NextResponse.json(data, { ...init, headers: { ...PRIVATE_HEADERS, ...init.headers } });
}

export function apiError(status: number, code: string, message: string, details?: unknown) {
  return jsonResponse({ error: { code, message, ...(details ? { details } : {}) } }, { status });
}

/** Resolve the verified user for an API route, or a 401 response. */
export async function requireApiUser(): Promise<AuthContext | NextResponse> {
  const ctx = await getAuthContext();
  if (!ctx) return apiError(401, "unauthorized", "Sign in required.");
  return ctx;
}

/**
 * Reject cross-site state-changing requests. Session cookies are SameSite=Lax,
 * this is defense in depth for POST/PATCH/DELETE route handlers.
 */
export function rejectCrossOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) return apiError(403, "forbidden", "Missing Origin header.");
  const allowed = new Set([new URL(serverEnv().APP_URL).origin, new URL(request.url).origin]);
  return allowed.has(origin) ? null : apiError(403, "forbidden", "Cross-origin request rejected.");
}

export async function parseJson<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { response: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { response: apiError(400, "invalid_json", "Request body must be JSON.") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const message = first ? `${first.path.length ? `${first.path.join(".")}: ` : ""}${first.message}` : "Request validation failed.";
    return { response: apiError(422, "invalid_input", message, parsed.error.issues) };
  }
  return { data: parsed.data };
}

/** Map a PostgREST/Postgres error to a safe client response without leaking internals. */
export function dbError(error: { code?: string; message: string }, fallback = "Database request failed.") {
  if (error.code === "22023" || error.code === "23514") return apiError(422, "rejected", error.message);
  if (error.code === "23505") return apiError(409, "conflict", "That already exists.");
  if (error.code === "42501") return apiError(403, "forbidden", "Not allowed.");
  console.error("database error", error.code);
  return apiError(500, "server_error", fallback);
}
