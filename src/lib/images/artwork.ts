import "server-only";
import sharp from "sharp";
import { headObject, writeDerivedObject } from "@/lib/r2";
import { sniffImageType } from "./remote";

type ImageSource = { body: Buffer; contentType: string };
const pending = new Map<string, Promise<string | null>>();
const waiting: (() => void)[] = [];
let active = 0;

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

export async function cachedArtwork(key: string, width: number, load: () => Promise<ImageSource>): Promise<string | null> {
  const existing = pending.get(key);
  if (existing) return existing;
  if (await headObject(key)) return key;
  const concurrent = pending.get(key);
  if (concurrent) return concurrent;
  if (pending.size >= 24) throw new Error("Artwork queue is full.");
  const task = slot(async () => {
    const image = await resizeArtwork(await load(), width);
    if (!image) return null;
    await writeDerivedObject(key, image.body, image.contentType);
    return key;
  }).finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}