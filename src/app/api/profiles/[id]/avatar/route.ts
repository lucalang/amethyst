import { NextResponse } from "next/server";
import { artworkSrc, isValidAttachmentName } from "@/lib/attachments";
import { isMemberId } from "@/lib/data/profiles";
import { apiError, dbError, requireApiUser } from "@/lib/http";
import { objectKey, presignDownload, r2Configured } from "@/lib/r2";

type Params = { params: Promise<{ id: string }> };

const notFound = () => apiError(404, "not_found", "Avatar not found.");

/** A member's avatar for other signed-in members: only the picture currently set on their profile. */
export async function GET(request: Request, { params }: Params) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!isMemberId(id)) return notFound();

  const { data, error } = await ctx.supabase.rpc("member_avatar", { p_user: id });
  if (error) return dbError(error, "Could not load the avatar.");
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
