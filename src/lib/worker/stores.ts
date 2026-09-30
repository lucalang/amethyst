// Supabase-backed adapters for the worker (service-role client).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../supabase/database.types.ts";
import type { CacheKey, CachedResponse, ProviderCache } from "../providers/cache.ts";
import type { Throttle } from "../providers/http.ts";
import { JIKAN_ATTRIBUTION, animeImageUrl, characterImageUrl } from "../providers/jikan.ts";
import type { ImportSink } from "../imports/pipeline.ts";

export type Admin = SupabaseClient<Database>;

/** Cast structured data for a non-null jsonb column. */
export const toJson = (value: unknown) => value as NonNullable<Json>;

/** Throttle shared by all worker invocations through a database slot reservation. */
export function createDbThrottle(db: Admin, provider: string, intervalMs: number, sleep: (ms: number) => Promise<void>): Throttle {
  return {
    async acquire() {
      const { data, error } = await db.rpc("reserve_provider_slot", { p_provider: provider, p_interval_ms: intervalMs });
      if (error) throw new Error(`throttle unavailable: ${error.code ?? "unknown"}`);
      if (typeof data === "number" && data > 0) await sleep(data);
    },
    async block(retryAfterMs) {
      await db.rpc("block_provider", { p_provider: provider, p_retry_after_ms: Math.ceil(retryAfterMs) });
    },
  };
}

export function createDbCache(db: Admin): ProviderCache {
  return {
    async get(key: CacheKey): Promise<CachedResponse | undefined> {
      const { data } = await db
        .from("provider_cache")
        .select("status, payload, expires_at")
        .eq("provider", key.provider)
        .eq("endpoint", key.endpoint)
        .eq("resource_id", key.resourceId)
        .eq("page", key.page)
        .maybeSingle();
      if (!data || Date.parse(data.expires_at) <= Date.now()) return undefined;
      return { status: data.status, payload: data.payload };
    },
    async set(key, value, ttlSeconds) {
      await db.from("provider_cache").upsert(
        {
          provider: key.provider,
          endpoint: key.endpoint,
          resource_id: key.resourceId,
          page: key.page,
          status: value.status,
          payload: value.payload as Json,
          fetched_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
        },
        { onConflict: "provider,endpoint,resource_id,page" },
      );
    },
  };
}

function fail(context: string, error: { code?: string; message: string } | null): never {
  throw new Error(`${context} failed: ${error?.code ?? ""} ${error?.message ?? ""}`.trim());
}

/** Writes an import into the job owner's vault. Ownership comes from the job row. */
export function createImportSink(db: Admin, jobId: string): ImportSink {
  return {
    async begin(root) {
      const { data, error } = await db.rpc("import_begin", {
        p_job_id: jobId,
        p_root: { mal_id: root.mal_id, title: root.title, image_url: animeImageUrl(root) } as Json,
      });
      if (error || !data) fail("import_begin", error);
      return data;
    },
    async applyNode(entryId, node, anime) {
      const imageUrl = animeImageUrl(anime);
      const { error: catalogError } = await db.from("catalog_anime").upsert(
        {
          mal_id: anime.mal_id,
          title: anime.title,
          title_english: anime.title_english ?? null,
          media_type: anime.type ?? null,
          episodes: anime.episodes ?? null,
          airing_status: anime.status ?? null,
          aired_from: anime.aired?.from ?? null,
          year: anime.year ?? null,
          score: anime.score ?? null,
          image_url: imageUrl,
          synopsis: anime.synopsis ?? null,
          data: toJson({
            url: anime.url ?? null,
            genres: (anime.genres ?? []).map((genre) => genre.name),
            studios: (anime.studios ?? []).map((studio) => studio.name),
            duration: anime.duration ?? null,
            rating: anime.rating ?? null,
            season: anime.season ?? null,
            aired: anime.aired?.string ?? null,
          }),
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "mal_id" },
      );
      if (catalogError) fail("catalog_anime upsert", catalogError);

      const relations = (anime.relations ?? []).flatMap((group) =>
        group.entry.map((entry) => ({
          from_mal_id: anime.mal_id,
          to_mal_id: entry.mal_id,
          relation: group.relation,
          to_type: entry.type,
          to_name: entry.name ?? null,
        })),
      );
      if (relations.length > 0) {
        const { error } = await db.from("catalog_relations").upsert(relations, { onConflict: "from_mal_id,to_mal_id,relation" });
        if (error) fail("catalog_relations upsert", error);
      }

      const { error } = await db.rpc("import_apply_node", {
        p_job_id: jobId,
        p_entry_id: entryId,
        p_node: {
          mal_id: node.malId,
          kind: node.kind,
          title: node.title,
          total_episodes: node.totalEpisodes,
          section: node.section,
          relation: node.relation,
          position: node.position,
          metadata: {
            image_url: imageUrl,
            provider_type: anime.type ?? null,
            airing_status: anime.status ?? null,
            aired_from: anime.aired?.from ?? null,
            aired: anime.aired?.string ?? null,
            year: anime.year ?? null,
            score: anime.score ?? null,
            synopsis: anime.synopsis ?? null,
            url: anime.url ?? null,
            attribution: JIKAN_ATTRIBUTION,
          },
        } as Json,
      });
      if (error) fail("import_apply_node", error);
    },
    async applyEpisodes(parentMalId, episodes) {
      const { error } = await db.rpc("import_apply_episodes", {
        p_job_id: jobId,
        p_parent_mal_id: parentMalId,
        p_episodes: episodes.map((episode) => ({
          number: episode.mal_id,
          title: episode.title ?? null,
          title_japanese: episode.title_japanese ?? null,
          aired: episode.aired ?? null,
          filler: episode.filler ?? null,
          recap: episode.recap ?? null,
        })) as Json,
      });
      if (error) fail("import_apply_episodes", error);
    },
    async saveCharacters(animeMalId, characters) {
      const rows = characters.slice(0, 60).map((character, index) => ({
        anime_mal_id: animeMalId,
        character_mal_id: character.character.mal_id,
        name: character.character.name,
        image_url: characterImageUrl(character),
        role: character.role ?? null,
        favorites: character.favorites ?? null,
        position: index,
        fetched_at: new Date().toISOString(),
      }));
      const unique = Array.from(new Map(rows.map((row) => [row.character_mal_id, row])).values());
      const { error } = await db.from("catalog_characters").upsert(unique, { onConflict: "anime_mal_id,character_mal_id" });
      if (error) fail("catalog_characters upsert", error);
    },
    async finish(entryId, summary) {
      const { error } = await db.rpc("import_finish", { p_job_id: jobId, p_entry_id: entryId, p_summary: summary as unknown as Json });
      if (error) fail("import_finish", error);
    },
  };
}
