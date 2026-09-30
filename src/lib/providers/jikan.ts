// Jikan v4 adapter: public MyAnimeList metadata (no user data, no writes).
import { z } from "zod";
import type { ProviderCache } from "./cache.ts";
import { ProviderError, requestWithRetry, type HttpDeps } from "./http.ts";

export const JIKAN_PROVIDER = "jikan";
export const JIKAN_ATTRIBUTION = "Metadata and artwork from MyAnimeList via Jikan";

const imageSet = z
  .object({
    image_url: z.string().nullish(),
    small_image_url: z.string().nullish(),
    large_image_url: z.string().nullish(),
  })
  .partial();

const relationEntry = z.object({
  mal_id: z.number().int().positive(),
  type: z.string(),
  name: z.string().nullish(),
});

export const jikanAnimeSchema = z.object({
  mal_id: z.number().int().positive(),
  url: z.string().nullish(),
  images: z.object({ jpg: imageSet.nullish(), webp: imageSet.nullish() }).nullish(),
  title: z.string().min(1),
  title_english: z.string().nullish(),
  title_japanese: z.string().nullish(),
  type: z.string().nullish(),
  source: z.string().nullish(),
  episodes: z.number().int().nonnegative().nullish(),
  status: z.string().nullish(),
  airing: z.boolean().nullish(),
  aired: z.object({ from: z.string().nullish(), to: z.string().nullish(), string: z.string().nullish() }).nullish(),
  duration: z.string().nullish(),
  rating: z.string().nullish(),
  score: z.number().nullish(),
  synopsis: z.string().nullish(),
  season: z.string().nullish(),
  year: z.number().int().nullish(),
  genres: z.array(z.object({ name: z.string() })).nullish(),
  studios: z.array(z.object({ name: z.string() })).nullish(),
  relations: z.array(z.object({ relation: z.string(), entry: z.array(relationEntry) })).nullish(),
});
export type JikanAnime = z.infer<typeof jikanAnimeSchema>;

const episodeSchema = z.object({
  mal_id: z.number().int().positive(),
  title: z.string().nullish(),
  title_japanese: z.string().nullish(),
  aired: z.string().nullish(),
  filler: z.boolean().nullish(),
  recap: z.boolean().nullish(),
});
export type JikanEpisode = z.infer<typeof episodeSchema>;

const episodesPageSchema = z.object({
  pagination: z.object({ last_visible_page: z.number().int().nullish(), has_next_page: z.boolean() }),
  data: z.array(episodeSchema),
});
export type JikanEpisodesPage = z.infer<typeof episodesPageSchema>;

const characterSchema = z.object({
  character: z.object({
    mal_id: z.number().int().positive(),
    name: z.string().min(1),
    images: z.object({ jpg: imageSet.nullish(), webp: imageSet.nullish() }).nullish(),
  }),
  role: z.string().nullish(),
  favorites: z.number().int().nullish(),
});
export type JikanCharacter = z.infer<typeof characterSchema>;

const animeEnvelope = z.object({ data: jikanAnimeSchema });
const charactersEnvelope = z.object({ data: z.array(characterSchema) });
const searchEnvelope = z.object({ data: z.array(jikanAnimeSchema) });

export function animeImageUrl(anime: Pick<JikanAnime, "images">, size: "large" | "regular" = "large"): string | null {
  const jpg = anime.images?.jpg;
  const webp = anime.images?.webp;
  const url =
    size === "large"
      ? (webp?.large_image_url ?? jpg?.large_image_url ?? jpg?.image_url)
      : (webp?.image_url ?? jpg?.image_url);
  return url && url.startsWith("https://") ? url : null;
}

export function characterImageUrl(character: JikanCharacter): string | null {
  const url = character.character.images?.webp?.image_url ?? character.character.images?.jpg?.image_url ?? null;
  // MAL serves a generic "questionmark" placeholder when no picture exists.
  if (!url || !url.startsWith("https://") || url.includes("questionmark")) return null;
  return url;
}

export interface JikanClient {
  getAnime(malId: number): Promise<JikanAnime | null>;
  getEpisodes(malId: number, page: number): Promise<JikanEpisodesPage | null>;
  getCharacters(malId: number): Promise<JikanCharacter[] | null>;
  searchAnime(query: string, limit?: number): Promise<JikanAnime[]>;
}

export type JikanClientOptions = {
  baseUrl: string;
  http: HttpDeps;
  cache?: ProviderCache;
  maxInlineWaitMs?: number;
};

const HOUR = 3600;

export function createJikanClient(options: JikanClientOptions): JikanClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");

  async function get<T extends z.ZodType>(
    path: string,
    endpoint: string,
    resourceId: string,
    page: number,
    schema: T,
    ttl: (value: z.infer<T>) => number,
  ): Promise<z.infer<T> | null> {
    const key = { provider: JIKAN_PROVIDER, endpoint, resourceId, page };
    const cached = await options.cache?.get(key);
    if (cached) {
      if (cached.status === 404) return null;
      const parsed = schema.safeParse(cached.payload);
      if (parsed.success) return parsed.data;
    }

    const response = await requestWithRetry(
      `${baseUrl}${path}`,
      // Jikan's edge cache varies by encoding; gzip is the most commonly cached variant.
      { headers: { Accept: "application/json", "Accept-Encoding": "gzip" } },
      options.http,
      { provider: JIKAN_PROVIDER, maxInlineWaitMs: options.maxInlineWaitMs },
    );
    if (response.status === 404) {
      await options.cache?.set(key, { status: 404, payload: null }, 6 * HOUR);
      return null;
    }
    if (!response.ok) {
      throw new ProviderError(`Jikan responded ${response.status} for ${endpoint}`, JIKAN_PROVIDER, response.status, false);
    }
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) {
      throw new ProviderError(`Unexpected Jikan payload for ${endpoint}`, JIKAN_PROVIDER, response.status, false);
    }
    await options.cache?.set(key, { status: 200, payload: parsed.data }, ttl(parsed.data));
    return parsed.data;
  }

  return {
    async getAnime(malId) {
      const envelope = await get(`/anime/${malId}/full`, "anime_full", String(malId), 1, animeEnvelope, (value) =>
        value.data.status === "Finished Airing" ? 72 * HOUR : 12 * HOUR,
      );
      return envelope?.data ?? null;
    },
    async getEpisodes(malId, page) {
      return get(`/anime/${malId}/episodes?page=${page}`, "anime_episodes", String(malId), page, episodesPageSchema, () => 12 * HOUR);
    },
    async getCharacters(malId) {
      const envelope = await get(`/anime/${malId}/characters`, "anime_characters", String(malId), 1, charactersEnvelope, () => 168 * HOUR);
      return envelope?.data ?? null;
    },
    async searchAnime(query, limit = 12) {
      const q = query.trim().slice(0, 100);
      if (!q) return [];
      const params = new URLSearchParams({ q, limit: String(Math.min(Math.max(limit, 1), 25)), order_by: "members", sort: "desc" });
      const envelope = await get(`/anime?${params.toString()}`, "anime_search", q.toLowerCase(), 1, searchEnvelope, () => HOUR);
      return envelope?.data ?? [];
    },
  };
}
