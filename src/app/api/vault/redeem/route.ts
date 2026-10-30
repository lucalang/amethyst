import { z } from "zod";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { hashCode, normalizeCode } from "@/lib/secret-codes";

const redeemSchema = z.object({ code: z.string().max(200) }).strict();

type Redemption =
  | { status: "unlocked"; coins: number; items: string[]; newItems: string[]; balance: number }
  | { status: "already"; coins: number; items: string[]; redeemedAt: string; balance: number }
  | { status: "unknown"; triesLeft: number };

/**
 * Redeem a Vault code. The code is normalized and hashed here and never logged or stored; the
 * database checks the hash, throttles failed tries and grants every reward in one transaction.
 */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, redeemSchema);
  if ("response" in parsed) return parsed.response;

  const code = normalizeCode(parsed.data.code);
  if (!code) return apiError(422, "invalid_code", "Codes are 4 to 40 letters and numbers.");
  const { data, error } = await ctx.supabase.rpc("redeem_secret_code", { p_code_hash: hashCode(code) });
  if (error) return dbError(error, "The vault didn’t answer. Nothing was used up, so try again.");
  const result = data as Redemption | null;
  if (!result || !["unlocked", "already", "unknown"].includes(result.status)) return apiError(500, "server_error", "The vault didn’t answer.");
  return jsonResponse(result);
}
