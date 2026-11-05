import "server-only";
import { createHash } from "node:crypto";
import { apiError } from "@/lib/http";
import { ENABLED_DEMO_SPECS, configuredDemoOrigin } from "@/lib/version-history";
import { BROWSER_DEMO_SPECS, findBrowserDemoSpec } from "@/lib/browser-version-demos";

export type LiveDemoRuntimeState = {
  sha: string;
  shortSha: string;
  online: boolean;
  demoUrl: string | null;
};

export const configuredDemoUrl = configuredDemoOrigin;

let cachedStates: { expiresAt: number; states: Record<string, LiveDemoRuntimeState> } | undefined;
let pendingStates: Promise<Record<string, LiveDemoRuntimeState>> | undefined;

export async function loadDemoStates(): Promise<Record<string, LiveDemoRuntimeState>> {
  if (cachedStates && cachedStates.expiresAt > Date.now()) return cachedStates.states;
  if (pendingStates) return pendingStates;
  pendingStates = Promise.all(ENABLED_DEMO_SPECS.map(async (spec) => {
    const base = configuredDemoUrl(spec);
    const state: LiveDemoRuntimeState = {
      sha: spec.sha,
      shortSha: spec.shortSha,
      online: false,
      demoUrl: base ? new URL(spec.defaultPath, base).href : null,
    };
    if (findBrowserDemoSpec(spec.sha)) {
      return [spec.sha, { ...state, online: true, demoUrl: `/demos/${spec.shortSha}` }] as const;
    }
    if (base) {
      try {
        const response = await fetch(new URL("/__demo/status", base), {
          cache: "no-store",
          credentials: "omit",
          redirect: "error",
          signal: AbortSignal.timeout(750),
        });
        if (response.ok) {
          const data = await response.json() as { ok?: boolean; sha?: string };
          state.online = data.ok === true && data.sha === spec.sha;
        }
      } catch {
        state.online = false;
      }
    }
    return [spec.sha, state] as const;
  })).then((entries) => {
    const states = Object.fromEntries(entries);
    for (const spec of BROWSER_DEMO_SPECS) {
      const shortSha = spec.sha.slice(0, 7);
      states[spec.sha] = { sha: spec.sha, shortSha, online: true, demoUrl: `/demos/${shortSha}` };
    }
    cachedStates = { expiresAt: Date.now() + 10_000, states };
    return states;
  }).finally(() => { pendingStates = undefined; });
  return pendingStates;
}

const requestBuckets = new Map<string, { count: number; expiresAt: number }>();

export function limitDemoRequest(request: Request, action: "status" | "reset") {
  const now = Date.now();
  for (const [key, bucket] of requestBuckets) {
    if (bucket.expiresAt <= now) requestBuckets.delete(key);
  }
  const address = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = `${action}:${createHash("sha256").update(address).digest("hex")}`;
  let bucket = requestBuckets.get(key);
  if (!bucket && requestBuckets.size < 5000) {
    bucket = { count: 0, expiresAt: now + 60_000 };
    requestBuckets.set(key, bucket);
  }
  if (!bucket || bucket.count >= (action === "status" ? 60 : 10)) {
    const response = apiError(429, "rate_limited", "Too many demo requests. Please wait a minute.");
    response.headers.set("Retry-After", "60");
    return response;
  }
  bucket.count += 1;
  return null;
}