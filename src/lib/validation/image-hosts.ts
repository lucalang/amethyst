// Remote artwork hosts. Shared by next.config.ts (next/image remotePatterns)
// and URL validation, so only allow-listed hosts are ever fetched or stored.
// Plain module with no path aliases: it is imported by next.config.ts.

export const DEFAULT_IMAGE_HOSTS: readonly string[] = [
  "cdn.myanimelist.net",
  "images.igdb.com",
  "cdn.cloudflare.steamstatic.com",
  "shared.cloudflare.steamstatic.com",
  "shared.akamai.steamstatic.com",
  "upload.wikimedia.org",
  "i.imgur.com",
  "s4.anilist.co",
];

const HOSTNAME = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

export function parseExtraImageHosts(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter((host) => HOSTNAME.test(host));
}

export function getAllowedImageHosts(extra: string | undefined): string[] {
  return Array.from(new Set([...DEFAULT_IMAGE_HOSTS, ...parseExtraImageHosts(extra)]));
}

export function isAllowedImageUrl(value: string, hosts: readonly string[]): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.port === "" &&
    hosts.includes(url.hostname.toLowerCase())
  );
}
