import "server-only";
import sharp from "sharp";
import { headObject, writeDerivedObject } from "@/lib/r2";
import { sniffImageType } from "./remote";

type ImageSource = { body: Buffer; contentType: string };
const pending = new Map<string, Promise<string | null>>();
const waiting: (() => void)[] = [];
let active = 0;
// Derived keys already confirmed in R2 (objects are write-once), so repeat requests skip the HEAD round trip.
const known = new Set<string>();
// Recently loaded originals, so sibling widths of the same artwork don't download it again.
const sources = new Map<string, { value: Promise<ImageSource>; expires: number }>();
const SOURCE_TTL = 60_000;

function remember(key: string) {
  known.add(key);
  if (known.size > 4000) known.delete(known.values().next().value!);
}

function sharedSource(id: string, load: () => Promise<ImageSource>): Promise<ImageSource> {
  const now = Date.now();
  for (const [key, entry] of sources) if (entry.expires < now) sources.delete(key);
  const hit = sources.get(id);
  if (hit) return hit.value;
  const value = load();
  sources.set(id, { value, expires: now + SOURCE_TTL });
  value.catch(() => sources.delete(id));
  if (sources.size > 8) sources.delete(sources.keys().next().value!);
  return value;
}

async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (active >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
  else active++;
  try {
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

export async function resizeArtwork(source: ImageSource, width: number): Promise<ImageSource | null> {
  if (!/^image\/(jpeg|png|webp|avif|bmp|gif)$/.test(source.contentType)) return null;
  if (sniffImageType(source.body) !== source.contentType) return null;
  const image = sharp(source.body, { animated: true, limitInputPixels: 40_000_000, failOn: "error" });
  const metadata = await image.metadata();
  if ((metadata.pages ?? 1) > 1 || source.contentType === "image/gif") return source;
  const body = await image.rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 90, effort: 4 }).toBuffer();
  return { body, contentType: "image/webp" };
}

/** `sourceId` identifies the original (user + src + revision) so its download is shared across widths. */
export async function cachedArtwork(key: string, width: number, sourceId: string, load: () => Promise<ImageSource>): Promise<string | null> {
  if (known.has(key)) return key;
  const existing = pending.get(key);
  if (existing) return existing;
  if (await headObject(key)) {
    remember(key);
    return key;
  }
  const concurrent = pending.get(key);
  if (concurrent) return concurrent;
  if (pending.size >= 24) throw new Error("Artwork queue is full.");
  const task = slot(async () => {
    const image = await resizeArtwork(await sharedSource(sourceId, load), width);
    if (!image) return null;
    await writeDerivedObject(key, image.body, image.contentType);
    remember(key);
    return key;
  }).finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}