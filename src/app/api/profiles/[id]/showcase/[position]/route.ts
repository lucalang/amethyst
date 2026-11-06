import { NextResponse } from "next/server";
import { artworkSrc, isValidAttachmentName } from "@/lib/attachments";
import { isMemberId } from "@/lib/data/profiles";
import { apiError, dbError, requireApiUser } from "@/lib/http";
import { MAX_SHOWCASE_ITEMS } from "@/lib/profile-styles";
import { objectKey, presignDownload, r2Configured } from "@/lib/r2";

type Params = { params: Promise<{ id: string; position: string }> };

const notFound = () => apiError(404, "not_found", "Artwork not found.");

/** Artwork of one featured showcase slot, for signed-in members: only what the owner currently features. */
export async function GET(request: Request, { params }: Params) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id, position } = await params;
  const slot = Number(position);
  if (!isMemberId(id) || !Number.isInteger(slot) || slot < 1 || slot > MAX_SHOWCASE_ITEMS) return notFound();

  const { data, error } = await ctx.supabase.rpc("member_showcase_image", { p_user: id, p_position: slot });
  if (error) return dbError(error, "Could not load the artwork.");
  const row = data?.[0];
  const headers = { "Cache-Control": "private, max-age=600", Vary: "Cookie" };

  if (row?.remote_url) {
    const proxied = artworkSrc(row.remote_url);
    return proxied?.startsWith("/api/image") ? NextResponse.redirect(new URL(proxied, request.url), { status: 302, headers }) : notFound();
  }
  if (!row?.object_name || !isValidAttachmentName(row.object_name)) return notFound();
  if (!r2Configured()) return apiError(503, "storage_unavailable", "Image storage is not configured.");
  const { url } = await presignDownload(objectKey(id, row.object_name), false);
  return NextResponse.redirect(url, { status: 302, headers });
}
