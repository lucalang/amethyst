// Parses import input: a MAL anime ID, a MAL anime URL, or free-text title.

export type ParsedImportInput = { type: "id"; malId: number } | { type: "title"; query: string } | { type: "invalid"; reason: string };

const MAL_HOSTS = new Set(["myanimelist.net", "www.myanimelist.net"]);

export function parseImportInput(raw: string): ParsedImportInput {
  const value = raw.trim();
  if (!value) return { type: "invalid", reason: "Enter a MyAnimeList ID, URL or title." };
  if (value.length > 300) return { type: "invalid", reason: "Input is too long." };

  if (/^\d+$/.test(value)) {
    const malId = Number(value);
    return Number.isSafeInteger(malId) && malId > 0 ? { type: "id", malId } : { type: "invalid", reason: "Invalid ID." };
  }

  if (/^(https?:\/\/)?(www\.)?myanimelist\.net\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    } catch {
      return { type: "invalid", reason: "That URL could not be parsed." };
    }
    if (!MAL_HOSTS.has(url.hostname.toLowerCase())) return { type: "invalid", reason: "Only myanimelist.net URLs are supported." };
    const match = url.pathname.match(/^\/anime\/(\d+)(\/|$)/);
    if (!match) return { type: "invalid", reason: "Use a MyAnimeList anime URL (…/anime/<id>)." };
    const malId = Number(match[1]);
    return malId > 0 ? { type: "id", malId } : { type: "invalid", reason: "Invalid ID." };
  }

  return { type: "title", query: value };
}
