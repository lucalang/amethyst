import "server-only";
import { serverEnv } from "@/lib/env";
import { createMemoryCache } from "@/lib/providers/cache";
import { createLocalThrottle, realSleep } from "@/lib/providers/http";
import { animeImageUrl, createJikanClient, type JikanAnime } from "@/lib/providers/jikan";

// Per-instance cache and pacing for interactive catalog lookups. Durable
// imports use the worker's database-backed cache and shared throttle instead.
const cache = createMemoryCache(400);
const throttle = createLocalThrottle(400);

export function catalogClient() {
  return createJikanClient({
    baseUrl: serverEnv().JIKAN_BASE_URL,
    http: { fetch: globalThis.fetch.bind(globalThis), sleep: realSleep, throttle },
    cache,
    maxInlineWaitMs: 3_000,
  });
}

export type CatalogResult = {
  malId: number;
  title: string;
  titleEnglish: string | null;
  type: string | null;
  episodes: number | null;
  year: number | null;
  status: string | null;
  score: number | null;
  imageUrl: string | null;
};

export function toCatalogResult(anime: JikanAnime): CatalogResult {
  return {
    malId: anime.mal_id,
    title: anime.title,
    titleEnglish: anime.title_english ?? null,
    type: anime.type ?? null,
    episodes: anime.episodes ?? null,
    year: anime.year ?? (anime.aired?.from ? new Date(anime.aired.from).getUTCFullYear() : null),
    status: anime.status ?? null,
    score: anime.score ?? null,
    imageUrl: animeImageUrl(anime, "regular"),
  };
}

const windows = new Map<string, number[]>();

/** Simple per-user sliding window to keep interactive lookups polite. */
export function allowCatalogRequest(userId: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (windows.get(userId) ?? []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) {
    windows.set(userId, recent);
    return false;
  }
  recent.push(now);
  windows.set(userId, recent);
  return true;
}
