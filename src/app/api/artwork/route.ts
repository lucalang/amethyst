import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { ARTWORK_WIDTHS, ATTACHMENT_BUCKET, MAX_ATTACHMENT_BYTES, artworkSrc, isUploadedImagePath, uploadedImageName } from "@/lib/attachments";
import { apiError, dbError, requireApiUser } from "@/lib/http";
import { cachedArtwork } from "@/lib/images/artwork";
import { fetchRemoteImage } from "@/lib/images/remote";
import { objectKey, presignDownload, r2Configured, readObject } from "@/lib/r2";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const params = new URL(request.url).searchParams;
  const src = params.get("src") ?? "";
  const width = Number(params.get("width"));
  const original = src.length <= 4096 ? artworkSrc(src) : null;
  if (!original || !ARTWORK_WIDTHS.some((value) => value === width)) return apiError(400, "invalid_image", "Invalid artwork request.");
  const redirectOriginal = () => NextResponse.redirect(new URL(original, request.url), { status: 302, headers: { "Cache-Control": "private, max-age=1800", Vary: "Cookie" } });

  const name = isUploadedImagePath(src) ? uploadedImageName(src) : null;
  const { data: row, error } = name
    ? await ctx.supabase.from("attachment_objects").select("origin, r2_state, content_type, sha256").eq("user_id", ctx.userId).eq("name", name).maybeSingle()
    : { data: null, error: null };
  if (error) return dbError(error, "Could not load artwork.");
  if (name && (!row || (row.origin === "r2" && row.r2_state !== "verified"))) return apiError(404, "not_found", "Image not found.");
  if (!r2Configured()) {
    if (row?.r2_state === "verified") return apiError(503, "storage_unavailable", "Image storage is not configured.");
    return redirectOriginal();
  }
  if (row?.content_type === "image/gif") return redirectOriginal();

  const revision = name ? row?.sha256 ?? "immutable" : Math.floor(Date.now() / 86_400_000);
  const hash = createHash("sha256").update(JSON.stringify([src, revision])).digest("hex");
  const key = objectKey(ctx.userId, `_artwork/v1/${hash}/${width}`);
  try {
    const cached = await cachedArtwork(key, width, async () => {
      if (name && row?.r2_state === "verified") return { body: await readObject(objectKey(ctx.userId, name), MAX_ATTACHMENT_BYTES), contentType: row.content_type };
      if (name) {
        const { data, error: downloadError } = await ctx.supabase.storage.from(ATTACHMENT_BUCKET).download(objectKey(ctx.userId, name));
        if (downloadError || !data || data.size > MAX_ATTACHMENT_BYTES) throw new Error("Image is unavailable.");
        return { body: Buffer.from(await data.arrayBuffer()), contentType: data.type };
      }
      const result = await fetchRemoteImage(src);
      if (!result.ok) throw new Error("Remote artwork is unavailable.");
      return result;
    });
    if (!cached) return redirectOriginal();
    const { url, maxAge } = await presignDownload(cached, false);
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": `private, max-age=${maxAge}`, Vary: "Cookie" } });
  } catch {
    return apiError(503, "artwork_unavailable", "Artwork is temporarily unavailable.");
  }
}