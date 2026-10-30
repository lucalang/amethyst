import { cookies } from "next/headers";
import { jsonResponse, requireApiUser } from "@/lib/http";
import { ENABLED_DEMO_SPECS, getCatalogSummary } from "@/lib/version-history";

export type LiveDemoRuntimeState = {
  sha: string;
  shortSha: string;
  port: number;
  online: boolean;
  demoUrl: string;
  hasWorkspace: boolean;
  expiresAt: string | null;
};

async function probeDemoInstance(
  spec: (typeof ENABLED_DEMO_SPECS)[number],
  visitorCookieValue: string | undefined,
): Promise<LiveDemoRuntimeState> {
  const demoUrl = `http://localhost:${spec.port}${spec.defaultPath}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 750);
  try {
    const res = await fetch(`http://127.0.0.1:${spec.port}/__demo/status`, {
      method: "GET",
      headers: visitorCookieValue
        ? { Cookie: `amethyst_demo_vid_${spec.shortSha}=${encodeURIComponent(visitorCookieValue)}` }
        : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        sha: spec.sha,
        shortSha: spec.shortSha,
        port: spec.port,
        online: false,
        demoUrl,
        hasWorkspace: false,
        expiresAt: null,
      };
    }
    const data = (await res.json()) as { hasWorkspace?: boolean; expiresAt?: string | null };
    return {
      sha: spec.sha,
      shortSha: spec.shortSha,
      port: spec.port,
      online: true,
      demoUrl,
      hasWorkspace: Boolean(data.hasWorkspace),
      expiresAt: typeof data.expiresAt === "string" ? data.expiresAt : null,
    };
  } catch {
    return {
      sha: spec.sha,
      shortSha: spec.shortSha,
      port: spec.port,
      online: false,
      demoUrl,
      hasWorkspace: false,
      expiresAt: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;

  const cookieStore = await cookies();
  const results = await Promise.all(
    ENABLED_DEMO_SPECS.map((spec) =>
      probeDemoInstance(spec, cookieStore.get(`amethyst_demo_vid_${spec.shortSha}`)?.value),
    ),
  );

  const demos: Record<string, LiveDemoRuntimeState> = {};
  for (const state of results) {
    demos[state.sha] = state;
  }

  return jsonResponse({
    summary: getCatalogSummary(),
    demos,
  });
}
