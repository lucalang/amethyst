import { z } from "zod";
import { requireAdminApi } from "@/lib/admin";
import { ADMIN_ROLES } from "@/lib/admin-dashboard";
import { dbError, jsonResponse, parseJson, rejectCrossOrigin } from "@/lib/http";

const schema = z
  .object({
    userId: z.uuid(),
    /** null revokes access. */
    role: z.enum(ADMIN_ROLES).nullable(),
  })
  .strict();

/** Grant, change or revoke admin access. The database allows this for owners only, never on their own row, and keeps one owner. */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireAdminApi();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;

  const { data, error } = await ctx.supabase.rpc("admin_set_role", { p_user: parsed.data.userId, p_role: parsed.data.role });
  if (error) return dbError(error, "Admin access couldn’t be changed. Nothing was changed.");
  return jsonResponse(data);
}
