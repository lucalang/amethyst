import { jsonResponse, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { disconnectMal } from "@/lib/sync/connection.server";

export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  await disconnectMal(ctx.userId);
  return jsonResponse({ disconnected: true });
}
