import { z } from "zod";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import type { SlotSpin, SlotSpinResult } from "@/lib/slots";

const spinSchema = z
  .object({
    /** Made by the client for each press of Spin; a retry reuses it and gets the same result back. */
    spinId: z.uuid(),
    bet: z.number().int().positive().max(1000),
  })
  .strict();

/** Look up one of your spins, to finish showing a spin interrupted by a reload or lost connection. */
export async function GET(request: Request) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const id = z.uuid().safeParse(new URL(request.url).searchParams.get("spin"));
  if (!id.success) return apiError(422, "invalid_input", "Pass the spin id as ?spin=.");

  const { data, error } = await ctx.supabase
    .from("slot_spins")
    .select("id, bet, stops, symbols, multiplier, payout, balance_after, created_at")
    .eq("id", id.data)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error) return dbError(error, "Couldn’t check that spin.");
  if (!data) return apiError(404, "not_found", "That spin never reached the machine, so nothing was charged.");
  const spin: SlotSpin = {
    spinId: data.id,
    bet: data.bet,
    stops: data.stops,
    symbols: data.symbols,
    multiplier: data.multiplier,
    payout: data.payout,
    net: data.payout - data.bet,
    balanceAfter: data.balance_after,
    createdAt: data.created_at,
  };
  return jsonResponse(spin);
}

/** Spin once. The database checks the bet and limits, draws the reels, settles and records it in one transaction. */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, spinSchema);
  if ("response" in parsed) return parsed.response;

  const { data, error } = await ctx.supabase.rpc("spin_slots", { p_spin: parsed.data.spinId, p_bet: parsed.data.bet });
  if (error) return dbError(error, "The spin didn’t go through, and no coins were taken.");
  const result = data as SlotSpinResult | null;
  if (!result?.spinId) return apiError(500, "server_error", "The spin didn’t go through.");
  return jsonResponse(result);
}
