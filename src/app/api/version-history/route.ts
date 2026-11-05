import { jsonResponse } from "@/lib/http";
import { limitDemoRequest, loadDemoStates } from "@/lib/version-demo-runtime";
import { getCatalogSummary } from "@/lib/version-history";

export async function GET(request: Request) {
  const limited = limitDemoRequest(request, "status");
  if (limited) return limited;
  return jsonResponse({ summary: getCatalogSummary(), demos: await loadDemoStates() });
}
