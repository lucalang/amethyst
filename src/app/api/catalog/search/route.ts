import type { NextRequest } from "next/server";
import { ProviderError, RateLimitedError } from "@/lib/providers/http";
import { allowCatalogRequest, catalogClient, toCatalogResult } from "@/lib/providers/catalog.server";
import { apiError, jsonResponse, requireApiUser } from "@/lib/http";
import { parseImportInput } from "@/lib/imports/input";

export async function GET(request: NextRequest) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;

  const parsed = parseImportInput(request.nextUrl.searchParams.get("q") ?? "");
  if (parsed.type === "invalid") return apiError(422, "invalid_input", parsed.reason);
  if (!allowCatalogRequest(ctx.userId)) return apiError(429, "rate_limited", "Too many searches. Wait a moment and try again.");

  const jikan = catalogClient();
  try {
    if (parsed.type === "id") {
      const anime = await jikan.getAnime(parsed.malId);
      return jsonResponse({ results: anime ? [toCatalogResult(anime)] : [], exact: true });
    }
    const results = await jikan.searchAnime(parsed.query, 12);
    return jsonResponse({ results: results.map(toCatalogResult), exact: false });
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return apiError(503, "provider_busy", "The metadata provider is rate limiting requests. Try again shortly.");
    }
    if (error instanceof ProviderError) return apiError(502, "provider_error", "The metadata provider is unavailable right now.");
    throw error;
  }
}
