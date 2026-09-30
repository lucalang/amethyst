// Cache for public provider responses, keyed by provider/endpoint/id/page.

export type CacheKey = { provider: string; endpoint: string; resourceId: string; page: number };
export type CachedResponse = { status: number; payload: unknown };

export interface ProviderCache {
  get(key: CacheKey): Promise<CachedResponse | undefined>;
  set(key: CacheKey, value: CachedResponse, ttlSeconds: number): Promise<void>;
}

export function cacheKeyString(key: CacheKey): string {
  return `${key.provider}:${key.endpoint}:${key.resourceId}:${key.page}`;
}

/** Bounded in-memory LRU with TTL (per server instance). */
export function createMemoryCache(maxEntries = 500, now: () => number = Date.now): ProviderCache {
  const entries = new Map<string, { value: CachedResponse; expiresAt: number }>();
  return {
    async get(key) {
      const id = cacheKeyString(key);
      const hit = entries.get(id);
      if (!hit) return undefined;
      if (hit.expiresAt <= now()) {
        entries.delete(id);
        return undefined;
      }
      entries.delete(id);
      entries.set(id, hit);
      return hit.value;
    },
    async set(key, value, ttlSeconds) {
      const id = cacheKeyString(key);
      entries.delete(id);
      entries.set(id, { value, expiresAt: now() + ttlSeconds * 1000 });
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
  };
}
