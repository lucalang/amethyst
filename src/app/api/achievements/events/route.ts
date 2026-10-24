import { achievementEventSchema } from "@/lib/achievements";
import { recordAchievementEvent } from "@/lib/data/achievements";
import { apiError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, achievementEventSchema);
  if ("response" in parsed) return parsed.response;
  try {
    const achievementUnlocks = await recordAchievementEvent(ctx, parsed.data);
    return jsonResponse({ achievementUnlocks });
  } catch {
    return apiError(500, "server_error", "Could not record this achievement event.");
  }
}