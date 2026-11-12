import { requireAdminApi } from "@/lib/admin";
import { dashboardSchema } from "@/lib/admin-dashboard";
import { apiError, dbError, jsonResponse } from "@/lib/http";

/** The calling admin's dashboard: admins, their own overrides, valid choices and the audit log. */
export async function GET() {
  const ctx = await requireAdminApi();
  if (ctx instanceof Response) return ctx;
  const { data, error } = await ctx.supabase.rpc("admin_dashboard_state");
  if (error) return dbError(error, "The dashboard couldn’t be loaded. Try again.");
  const parsed = dashboardSchema.safeParse(data);
  if (!parsed.success) return apiError(500, "server_error", "The dashboard couldn’t be read. Reload to try again.");
  return jsonResponse(parsed.data);
}
