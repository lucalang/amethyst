import { loadSpinWheels, SPIN_WHEEL_COLUMNS, toSavedWheel } from "@/lib/data/spin-wheels";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { createWheelSchema, MAX_WHEELS } from "@/lib/spin-wheel";

export async function GET() {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  try {
    return jsonResponse({ wheels: await loadSpinWheels(ctx) });
  } catch (error) {
    return dbError(error as { code?: string; message: string });
  }
}

export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, createWheelSchema);
  if ("response" in parsed) return parsed.response;
  const { name, choices, settings } = parsed.data;

  const { data, error } = await ctx.supabase.from("spin_wheels").insert({ name, choices, settings }).select(SPIN_WHEEL_COLUMNS).single();
  if (error) {
    if (error.hint === "spin_wheel_limit") {
      return apiError(409, "spin_wheel_limit", `You can save up to ${MAX_WHEELS} wheels. Delete one to save another.`);
    }
    return dbError(error);
  }
  return jsonResponse({ wheel: toSavedWheel(data) }, { status: 201 });
}
