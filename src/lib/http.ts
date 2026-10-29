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
    const message = first?.message ?? "Check the highlighted fields and try again.";
    return { response: apiError(422, "invalid_input", message, parsed.error.issues) };
  }
  return { data: parsed.data };
}

/** Older database functions say "category" for what the interface calls a collection. */
const collectionWording = (message: string) =>
  message.replace(/\bcategories\b/g, "collections").replace(/\bcategory\b/g, "collection");

/** Errors raised by database functions with a `hint` naming the case, and their HTTP status. */
const HINTED: Record<string, number> = {
  cosmetic_not_owned: 403,
  insufficient_funds: 409,
  price_changed: 409,
  item_unavailable: 404,
  run_not_found: 404,
  rate_limited: 429,
  layout_changed: 409,
  list_changed: 409,
};

/** Map a PostgREST/Postgres error to a safe client response without leaking internals. */
export function dbError(error: { code?: string; message: string; hint?: string | null }, fallback = "Database request failed.") {
  if (error.hint && error.hint in HINTED) return apiError(HINTED[error.hint], error.hint, error.message);
  if (error.code === "22023") return apiError(422, "rejected", collectionWording(error.message));
  if (error.code === "23514") {
    if (/task_(lists|groups)_name_valid/.test(error.message)) {
      return apiError(422, "invalid_name", "Use a name between 1 and 120 characters, without line breaks. Spaces between words are allowed.");
    }
    if (/(tasks|task_steps)_title_valid/.test(error.message)) {
      return apiError(422, "invalid_title", "Use a task title between 1 and 500 characters, without line breaks.");
    }
    return apiError(422, "rejected", "These changes could not be saved. Check your entries and try again.");
  }
  if (error.code === "23505") return apiError(409, "conflict", "That already exists.");
  if (error.code === "23503") return apiError(404, "not_found", "A referenced item no longer exists. Reload and try again.");
  if (error.code === "42501") return apiError(403, "forbidden", "Not allowed.");
  console.error("database error", error.code);
  return apiError(500, "server_error", fallback);
}
