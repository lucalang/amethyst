import { cookies } from "next/headers";
import { z } from "zod";
import { apiError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { findEnabledDemoSpec } from "@/lib/version-history";

const resetSchema = z.object({
  sha: z.string().regex(/^[0-9a-f]{40}$/, "Commit SHA must be a full 40-character hexadecimal identifier."),
});

export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;

  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;

  const parsed = await parseJson(request, resetSchema);
  if ("response" in parsed) return parsed.response;

  const spec = findEnabledDemoSpec(parsed.data.sha);
  if (!spec) {
    return apiError(404, "not_found", "This commit does not have an enabled interactive demo.");
  }

  const cookieStore = await cookies();
  const visitorCookieName = `amethyst_demo_vid_${spec.shortSha}`;
  const visitorCookieVal = cookieStore.get(visitorCookieName)?.value;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const upstreamRes = await fetch(`http://127.0.0.1:${spec.port}/__demo/reset`, {
      method: "POST",
      headers: {
        Origin: `http://localhost:${spec.port}`,
        "Content-Type": "application/json",
        ...(visitorCookieVal ? { Cookie: `${visitorCookieName}=${encodeURIComponent(visitorCookieVal)}` } : {}),
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!upstreamRes.ok) {
      return apiError(502, "demo_unavailable", "The demo instance is not currently reachable.");
    }

    const payload = (await upstreamRes.json()) as { expiresAt?: string | null; redirectTo?: string };
    const response = jsonResponse({
      ok: true,
      sha: spec.sha,
      shortSha: spec.shortSha,
      demoUrl: `http://localhost:${spec.port}${spec.defaultPath}`,
      expiresAt: payload.expiresAt ?? null,
    });

    const upstreamSetCookies =
      typeof upstreamRes.headers.getSetCookie === "function" ? upstreamRes.headers.getSetCookie() : [];
    for (const rawCookie of upstreamSetCookies) {
      response.headers.append("Set-Cookie", rawCookie);
    }

    return response;
  } catch {
    return apiError(
      503,
      "demo_offline",
      `Demo server for ${spec.shortSha} is offline. Start local demos with: npm run demos -- start ${spec.shortSha}`,
    );
  } finally {
    clearTimeout(timer);
  }
}
