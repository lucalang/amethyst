import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { IMAGE_URL_MESSAGES, checkImageUrl, isPublicIpAddress } from "@/lib/validation/image-url";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;

export type RemoteImageError =
  | "invalid_url"
  | "private_address"
  | "unreachable"
  | "timeout"
  | "too_many_redirects"
  | "http_error"
  | "blocked"
  | "not_found"
  | "not_an_image"
  | "too_large";

export type RemoteImageResult =
  | { ok: true; contentType: string; body: Buffer; finalUrl: string }
  | { ok: false; code: RemoteImageError; message: string; upstreamStatus?: number };

const MESSAGES: Record<RemoteImageError, string> = {
  invalid_url: IMAGE_URL_MESSAGES.invalid,
  private_address: IMAGE_URL_MESSAGES.private,
  unreachable: "Could not reach that address. Check the link or try another host.",
  timeout: "The image host took too long to respond.",
  too_many_redirects: "The address redirects too many times.",
  http_error: "The image host returned an error.",
  blocked: "The image host refused the request. It may block images from being used on other sites (hotlinking).",
  not_found: "Nothing was found at that address (404).",
  not_an_image: "That address returns a web page, not an image. Open the image itself and copy its address.",
  too_large: "That image is larger than 10 MB.",
};

class BlockedAddressError extends Error {}

const failure = (code: RemoteImageError, upstreamStatus?: number): RemoteImageResult => ({
  ok: false,
  code,
  message: MESSAGES[code],
  ...(upstreamStatus ? { upstreamStatus } : {}),
});

type Resolver = (hostname: string, callback: (error: Error | null, addresses: LookupAddress[]) => void) => void;

const systemResolver: Resolver = (hostname, callback) =>
  dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) => callback(error, addresses ?? []));

/**
 * DNS lookup used for the actual connection: every resolved address must be
 * public, and the socket connects to exactly the addresses that were checked,
 * so DNS rebinding cannot swap in a private target after validation.
 */
export function safeLookup(resolve: Resolver = systemResolver): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname, (error, addresses) => {
      if (error) return callback(error, "", 4);
      if (addresses.length === 0 || addresses.some((entry) => !isPublicIpAddress(entry.address))) {
        return callback(new BlockedAddressError(`blocked address for ${hostname}`), "", 4);
      }
      const family = typeof options === "object" && options ? options.family : undefined;
      const usable = family === 4 || family === 6 ? addresses.filter((entry) => entry.family === family) : addresses;
      if (usable.length === 0) return callback(new BlockedAddressError(`no usable address for ${hostname}`), "", 4);
      if (typeof options === "object" && options?.all) {
        (callback as unknown as (error: null, addresses: LookupAddress[]) => void)(null, usable);
      } else {
        callback(null, usable[0].address, usable[0].family);
      }
    });
  };
}

/** Identify common image formats from their first bytes. */
export function sniffImageType(bytes: Buffer): string | null {
  const ascii = (start: number, end: number) => bytes.subarray(start, end).toString("latin1");
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp" && /^(avif|avis)$/.test(ascii(8, 12))) return "image/avif";
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
  if (bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return "image/x-icon";
  const head = bytes.subarray(0, 512).toString("utf8").replace(/^\uFEFF/, "").trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  return null;
}

type Fetched = { status: number; headers: http.IncomingHttpHeaders; body?: Buffer; error?: RemoteImageError };

function requestOnce(url: URL, lookup: LookupFunction, deadline: number): Promise<Fetched> {
  return new Promise((resolve) => {
    const client = url.protocol === "https:" ? https : http;
    const request = client.request(
      url,
      {
        method: "GET",
        agent: false,
        lookup,
        timeout: Math.max(1, deadline - Date.now()),
        headers: {
          Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,image/svg+xml,image/*;q=0.8",
          "Accept-Encoding": "identity",
          "User-Agent": "Mozilla/5.0 (compatible; AmethystArchives/1.0; +image-preview)",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          response.resume();
          return resolve({ status, headers: response.headers });
        }
        if (status < 200 || status >= 300) {
          response.resume();
          return resolve({ status, headers: response.headers });
        }
        const declared = Number(response.headers["content-length"]);
        if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
          response.destroy();
          return resolve({ status, headers: response.headers, error: "too_large" });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_IMAGE_BYTES) {
            response.destroy();
            resolve({ status, headers: response.headers, error: "too_large" });
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve({ status, headers: response.headers, body: Buffer.concat(chunks) }));
        response.on("error", () => resolve({ status, headers: response.headers, error: "unreachable" }));
      },
    );
    request.on("timeout", () => {
      request.destroy();
      resolve({ status: 0, headers: {}, error: "timeout" });
    });
    request.on("error", (error) => {
      resolve({ status: 0, headers: {}, error: error instanceof BlockedAddressError ? "private_address" : "unreachable" });
    });
    request.end();
  });
}

/**
 * Fetch an image for the proxy with SSRF protections: http(s) only, standard
 * ports, public addresses only (checked at connect time), redirects re-validated
 * hop by hop, image content verified, and size and time limits enforced.
 */
export async function fetchRemoteImage(rawUrl: string, options: { resolve?: Resolver } = {}): Promise<RemoteImageResult> {
  const lookup = safeLookup(options.resolve);
  const deadline = Date.now() + TIMEOUT_MS;
  let current = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const checked = checkImageUrl(current);
    if (!checked.ok) return failure(checked.problem === "private" ? "private_address" : "invalid_url");
    const url = checked.url;
    url.hash = "";

    const result = await requestOnce(url, lookup, deadline);
    if (result.error) return failure(result.error);

    if (result.status >= 300 && result.status < 400) {
      const location = result.headers.location;
      if (!location) return failure("http_error", result.status);
      try {
        current = new URL(location, url).toString();
      } catch {
        return failure("invalid_url");
      }
      continue;
    }
    if (result.status === 401 || result.status === 403 || result.status === 451) return failure("blocked", result.status);
    if (result.status === 404 || result.status === 410) return failure("not_found", result.status);
    if (result.status < 200 || result.status >= 300 || !result.body) return failure("http_error", result.status);

    const declaredType = String(result.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    const sniffed = sniffImageType(result.body);
    if (!sniffed) return failure("not_an_image");
    if (declaredType && !declaredType.startsWith("image/") && declaredType !== "application/octet-stream" && declaredType !== "binary/octet-stream") {
      return failure("not_an_image");
    }
    return { ok: true, contentType: sniffed, body: result.body, finalUrl: url.toString() };
  }
  return failure("too_many_redirects");
}
