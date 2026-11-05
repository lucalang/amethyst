import { z } from "zod";
import { apiError, jsonResponse, parseJson, rejectCrossOrigin } from "@/lib/http";
import { configuredDemoUrl, limitDemoRequest } from "@/lib/version-demo-runtime";
import { findEnabledDemoSpec } from "@/lib/version-history";
import { findBrowserDemoSpec } from "@/lib/browser-version-demos";

const resetSchema = z.object({
  sha: z.string().regex(/^[0-9a-f]{40}$/, "Commit SHA must be a full 40-character hexadecimal identifier."),
});

export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;

  const limited = limitDemoRequest(request, "reset");
  if (limited) return limited;

  const parsed = await parseJson(request, resetSchema);
  if ("response" in parsed) return parsed.response;

  const preview = findBrowserDemoSpec(parsed.data.sha);
  if (preview) {
    return jsonResponse({ ok: true, sha: preview.sha, resetUrl: `/demos/${preview.sha.slice(0, 7)}/index.html#reset` });
  }
  const spec = findEnabledDemoSpec(parsed.data.sha);
  if (!spec) {
    return apiError(404, "not_found", "This commit does not have an enabled interactive demo.");
  }
  const base = configuredDemoUrl(spec);
  if (!base) return apiError(503, "demo_offline", "The demo instance is not currently reachable.");
  return jsonResponse({ ok: true, sha: spec.sha, resetUrl: new URL("/__demo/reset-workspace", base).href });
}
