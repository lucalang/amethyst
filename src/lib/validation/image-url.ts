// Artwork URL rules shared by forms (client), validation (server) and the image
// proxy. Any public HTTP(S) host is allowed; local and private targets are not.

export const MAX_IMAGE_URL_LENGTH = 2048;
const ALLOWED_PORTS = new Set(["", "80", "443"]);
const LOCAL_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa", ".lan", ".intranet"];

export type ImageUrlProblem = "invalid" | "protocol" | "credentials" | "port" | "private";

export const IMAGE_URL_MESSAGES: Record<ImageUrlProblem, string> = {
  invalid: "Enter a full image address starting with https:// or http://.",
  protocol: "Only http:// and https:// image addresses are supported.",
  credentials: "Image addresses cannot contain a username or password.",
  port: "Only standard web ports (80 and 443) are supported.",
  private: "Local and private network addresses are not allowed.",
};

export function parseIPv4(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255) ? octets : null;
}

export function parseIPv6(value: string): number[] | null {
  let text = value.trim().toLowerCase();
  if (text.startsWith("[") && text.endsWith("]")) text = text.slice(1, -1);
  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);
  if (!text.includes(":")) return null;

  let tail: number[] = [];
  const lastColon = text.lastIndexOf(":");
  const last = text.slice(lastColon + 1);
  if (last.includes(".")) {
    const v4 = parseIPv4(last);
    if (!v4) return null;
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    text = text.slice(0, lastColon + 1) + "0:0";
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  let groups: string[];
  if (halves.length === 1) {
    if (head.length !== 8) return null;
    groups = head;
  } else {
    const missing = 8 - head.length - rest.length;
    if (missing < 1) return null;
    groups = [...head, ...Array<string>(missing).fill("0"), ...rest];
  }
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return null;
  const hextets = groups.map((group) => parseInt(group, 16));
  if (tail.length) hextets.splice(6, 2, ...tail);
  return hextets;
}

export function isPublicIPv4([a, b, c]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false; // this-network, private, loopback, multicast, reserved
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF assignments, TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return false; // 6to4 relay
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3
  return true;
}

export function isPublicIPv6(hextets: number[]): boolean {
  const embeddedV4 = () => [hextets[6] >> 8, hextets[6] & 0xff, hextets[7] >> 8, hextets[7] & 0xff];
  const zeroPrefix = (count: number) => hextets.slice(0, count).every((hextet) => hextet === 0);
  if (zeroPrefix(5) && hextets[5] === 0xffff) return isPublicIPv4(embeddedV4()); // IPv4-mapped
  if (hextets[0] === 0x64 && hextets[1] === 0xff9b && hextets.slice(2, 6).every((hextet) => hextet === 0)) {
    return isPublicIPv4(embeddedV4()); // NAT64
  }
  if ((hextets[0] & 0xe000) !== 0x2000) return false; // only global unicast (2000::/3)
  if (hextets[0] === 0x2001 && hextets[1] < 0x0200) return false; // IETF protocol assignments incl. Teredo
  if (hextets[0] === 0x2001 && hextets[1] === 0x0db8) return false; // documentation
  if (hextets[0] === 0x2002) return false; // 6to4 can tunnel to private IPv4
  return true;
}

/** True for public unicast IP addresses (the only targets the image proxy may connect to). */
export function isPublicIpAddress(address: string): boolean {
  const v4 = parseIPv4(address);
  if (v4) return isPublicIPv4(v4);
  const v6 = parseIPv6(address);
  return v6 ? isPublicIPv6(v6) : false;
}

/** Syntax-level checks; the proxy additionally verifies every resolved address. */
export function checkImageUrl(value: string): { ok: true; url: URL } | { ok: false; problem: ImageUrlProblem } {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return { ok: false, problem: "invalid" };
  }
  if (value.trim().length > MAX_IMAGE_URL_LENGTH) return { ok: false, problem: "invalid" };
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, problem: "protocol" };
  if (url.username || url.password) return { ok: false, problem: "credentials" };
  if (!ALLOWED_PORTS.has(url.port)) return { ok: false, problem: "port" };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false, problem: "invalid" };
  if (host === "localhost" || LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return { ok: false, problem: "private" };
  const literal = parseIPv4(host) ?? parseIPv6(host);
  if (literal && !isPublicIpAddress(host)) return { ok: false, problem: "private" };
  if (!literal && !host.includes(".")) return { ok: false, problem: "invalid" };
  return { ok: true, url };
}

/** Same-origin URL that serves a remote image through the authenticated proxy. */
export function imageProxyUrl(src: string): string {
  return `/api/image?url=${encodeURIComponent(src)}`;
}
