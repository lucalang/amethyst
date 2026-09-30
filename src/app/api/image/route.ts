import { NextResponse } from "next/server";
import { fetchRemoteImage } from "@/lib/images/remote";
import { apiError, jsonResponse, requireApiUser } from "@/lib/http";

// Remote artwork is served through this authenticated proxy so any public host
// works without an allowlist while the server never reaches private networks.
export async function GET(request: Request) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;

  const params = new URL(request.url).searchParams;
  const target = params.get("url");
  const check = params.get("mode") === "check";
  if (!target) return apiError(400, "invalid_input", "Missing url parameter.");

  const result = await fetchRemoteImage(target);
  if (check) {
    return jsonResponse(
      result.ok
        ? { ok: true, contentType: result.contentType, bytes: result.body.length }
        : { ok: false, code: result.code, message: result.message, upstreamStatus: result.upstreamStatus ?? null },
    );
  }
  if (!result.ok) {
    const status = result.code === "invalid_url" || result.code === "private_address" ? 400 : result.code === "not_found" ? 404 : 502;
    return apiError(status, result.code, result.message);
  }

  return new NextResponse(new Uint8Array(result.body), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Content-Length": String(result.body.length),
      "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
      // SVGs opened directly must not run script on this origin.
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
      "Content-Disposition": "inline",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
