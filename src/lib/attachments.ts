import { checkImageUrl, imageProxyUrl } from "@/lib/validation/image-url";

export const ATTACHMENT_BUCKET = "note-attachments";
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Upload types (no SVG: attachments are user-supplied and served without sanitizing). */
export const ATTACHMENT_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/bmp": "bmp",
};

const MAX_BASE_LENGTH = 100;

/** Obsidian's naming for pasted images: "Pasted image 20261001173400.png". */
export function pastedImageName(extension: string, date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `Pasted image ${stamp}.${extension}`;
}

/** A file name usable inside ![[…]] and as a storage key: no path, link or control characters. */
export function sanitizeAttachmentName(name: string, extension: string): string {
  const withoutExtension = name.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  const cleaned = [...withoutExtension]
    .filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
    .join("")
    .replace(/[\\/:*?"<>|[\]#^%]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_BASE_LENGTH)
    .trim();
  return `${cleaned || "Image"}.${extension}`;
}

/** "Pasted image 2026….png" → "Pasted image 2026… 1.png" for collisions. */
export function withSuffix(name: string, suffix: number): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)} ${suffix}${name.slice(dot)}` : `${name} ${suffix}`;
}

export function isValidAttachmentName(name: string): boolean {
  const dot = name.lastIndexOf(".");
  return dot > 0 && sanitizeAttachmentName(name, name.slice(dot + 1)) === name && Object.values(ATTACHMENT_TYPES).includes(name.slice(dot + 1).toLowerCase());
}

export const attachmentUrl = (name: string) => `/api/attachments/${encodeURIComponent(name)}`;

/** Where an embed's target is loaded from: own attachments, or public images through the proxy. */
export function resolveImageSrc(target: string): string | null {
  const value = target.trim();
  if (/^https?:\/\//i.test(value)) return checkImageUrl(value).ok ? imageProxyUrl(value) : null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  let name = value;
  try {
    name = decodeURIComponent(value);
  } catch {
    // Keep the raw text; Obsidian allows unencoded names in ![](…) too.
  }
  name = name.split("/").pop() ?? name;
  return name ? attachmentUrl(name) : null;
}

export type ImageEmbed = { from: number; to: number; target: string; alt: string; width: number | null; height: number | null };

const SIZE = /^(\d{1,4})(?:x(\d{1,4}))?$/;
const WIKI_EMBED = /!\[\[([^\]|\n]+?)(?:\|([^\]\n]*))?\]\]/g;
const MARKDOWN_IMAGE = /!\[([^\]\n]*)\]\(\s*(<[^>\n]+>|[^)\s]+)(?:\s+"[^"\n]*")?\s*\)/g;

function size(spec: string | undefined): { width: number | null; height: number | null } {
  const match = spec ? SIZE.exec(spec.trim()) : null;
  return match ? { width: Number(match[1]) || null, height: match[2] ? Number(match[2]) || null : null } : { width: null, height: null };
}

/** Image embeds in one line of Markdown: ![[name.png|300]] and ![alt|300x200](url). Offsets are relative to the line. */
export function findImageEmbeds(text: string): ImageEmbed[] {
  const embeds: ImageEmbed[] = [];
  for (const match of text.matchAll(WIKI_EMBED)) {
    const target = match[1].trim();
    if (!/\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(target)) continue;
    embeds.push({ from: match.index, to: match.index + match[0].length, target, alt: target, ...size(match[2]) });
  }
  for (const match of text.matchAll(MARKDOWN_IMAGE)) {
    const [alt, spec] = match[1].split("|");
    const target = match[2].replace(/^<|>$/g, "");
    embeds.push({ from: match.index, to: match.index + match[0].length, target, alt: alt.trim(), ...size(spec) });
  }
  return embeds.sort((a, b) => a.from - b.from);
}
