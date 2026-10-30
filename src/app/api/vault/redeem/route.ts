import { z } from "zod";
import { refreshArchiveAchievements } from "@/lib/data/achievements";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { CODE_RULES, typedCodeHashes } from "@/lib/secret-codes";

const redeemSchema = z.object({ code: z.string().max(200), request: z.uuid().optional() }).strict();

type Redemption =
  | { status: "unlocked"; coins: number; items: string[]; newItems: string[]; achievements: string[]; newAchievements: string[]; balance: number }
  | { status: "already"; coins: number; items: string[]; achievements: string[]; redeemedAt: string; balance: number }
  | { status: "unavailable" | "unknown"; triesLeft: number };

const STATUSES: readonly string[] = ["unlocked", "already", "unavailable", "unknown"];

/** Achievements a code unlocks are shown among its rewards as "achievement:<id>". */
const withAchievements = (items: string[], achievements: string[] | undefined) => [
  ...items,
  ...(achievements ?? []).map((id) => `achievement:${id}`),
];

function present(result: Redemption) {
  if (result.status === "unlocked") {
    const { achievements, newAchievements, ...rest } = result;
    return { ...rest, items: withAchievements(result.items, achievements), newItems: withAchievements(result.newItems, newAchievements) };
  }
  if (result.status === "already") {
    const { achievements, ...rest } = result;
    return { ...rest, items: withAchievements(result.items, achievements) };
  }
  return result;
}

/**
 * Redeem a Vault code. The code is normalized and hashed here and never logged or stored; the
 * database checks the hashes, throttles failed tries and grants every reward in one transaction.
 * `request` identifies one attempt: sending it again answers with what it granted, never twice.
 */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, redeemSchema);
  if ("response" in parsed) return parsed.response;

  const hashes = typedCodeHashes(parsed.data.code);
  if (!hashes) return apiError(422, "invalid_code", CODE_RULES);
  const { data, error } = await ctx.supabase.rpc("redeem_vault_code", {
    p_loose_hash: hashes.loose,
    p_phrase_hash: hashes.phrase,
    p_request: parsed.data.request ?? null,
  });
  if (error) return dbError(error, "The vault didn’t answer. Nothing was used up, so try again.");
  const result = data as Redemption | null;
  if (!result || !STATUSES.includes(result.status)) return apiError(500, "server_error", "The vault didn’t answer.");
  const achievementUnlocks = result.status === "unlocked" || result.status === "already" ? await refreshArchiveAchievements(ctx) : [];
  return jsonResponse({ ...present(result), achievementUnlocks });
}

/** The account's latest finds, so an interrupted redemption can be confirmed without sending the code again. */
export async function GET() {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { data, error } = await ctx.supabase
    .from("secret_code_redemptions")
    .select("redeemed_at, coins, items, achievements")
    .eq("user_id", ctx.userId)
    .order("redeemed_at", { ascending: false })
    .limit(50);
  if (error) return dbError(error, "The vault’s log couldn’t be read. Try again.");
  return jsonResponse({
    finds: data.map((row) => ({ redeemedAt: row.redeemed_at, coins: row.coins, items: withAchievements(row.items, row.achievements) })),
  });
}
