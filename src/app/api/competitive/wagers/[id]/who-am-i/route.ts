import { z } from "zod";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { CUSTOM_QUESTION_MAX, type WhoAmIState } from "@/lib/who-am-i";

type Params = { params: Promise<{ id: string }> };
const wagerId = z.uuid();
const round = z.coerce.number().int().positive().max(100);
const notFound = () => apiError(404, "wager_not_found", "That match was not found.");

const move = { round: z.number().int().positive().max(100), request: z.uuid(), seq: z.number().int().min(0) };
/** Every move is checked again in the database (turn, card truth, guess, consent); this only shapes the request. */
const actionSchema = z.union([
  z.object({ action: z.literal("join"), round: move.round }).strict(),
  z.object({ action: z.literal("consent"), round: move.round, custom: z.boolean() }).strict(),
  z.object({ action: z.literal("ask"), ...move, card: z.string().regex(/^[a-z-]{1,24}$/) }).strict(),
  z.object({ action: z.literal("ask"), ...move, text: z.string().min(1).max(CUSTOM_QUESTION_MAX * 2) }).strict(),
  z.object({ action: z.literal("answer"), ...move, answer: z.enum(["yes", "no", "unsure"]) }).strict(),
  z.object({ action: z.literal("guess"), ...move, guess: z.string().regex(/^[a-z]{1,24}$/) }).strict(),
]);

/** The round as this player may see it: their own identity stays hidden until it ends. */
export async function GET(request: Request, { params }: Params) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  const parsedRound = round.safeParse(new URL(request.url).searchParams.get("round"));
  if (!wagerId.safeParse(id).success || !parsedRound.success) return notFound();
  const { data, error } = await ctx.supabase.rpc("whoami_state", { p_wager: id, p_round: parsedRound.data });
  if (error) {
    if (error.hint === "wager_not_found") return notFound();
    return dbError(error, "The round couldn’t be loaded.");
  }
  return jsonResponse(data as unknown as WhoAmIState);
}

export async function POST(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!wagerId.safeParse(id).success) return notFound();
  const parsed = await parseJson(request, actionSchema);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data;

  const args =
    body.action === "join"
      ? {}
      : body.action === "consent"
        ? { p_answer: body.custom ? "yes" : "no" }
        : {
            p_request: body.request,
            p_seq: body.seq,
            ...("card" in body ? { p_card: body.card } : {}),
            ...("text" in body ? { p_text: body.text } : {}),
            ...("answer" in body ? { p_answer: body.answer } : {}),
            ...("guess" in body ? { p_guess: body.guess } : {}),
          };
  const { data, error } = await ctx.supabase.rpc("whoami_act", { p_wager: id, p_round: body.round, p_action: body.action, ...args });
  if (error) {
    if (error.hint === "wager_not_found") return notFound();
    if (error.hint?.startsWith("whoami_")) return apiError(409, error.hint, error.message);
    return dbError(error, "That move couldn’t be made.");
  }
  return jsonResponse(data as unknown as WhoAmIState);
}
