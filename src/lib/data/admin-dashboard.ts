import "server-only";
import { dashboardSchema, type AdminDashboardState } from "@/lib/admin-dashboard";
import type { AuthContext } from "@/lib/supabase/auth";

/** The dashboard for the calling admin; the database function checks the admin list itself. */
export async function loadAdminDashboard(ctx: AuthContext): Promise<AdminDashboardState | null> {
  const { data, error } = await ctx.supabase.rpc("admin_dashboard_state");
  if (error) return null;
  const parsed = dashboardSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}
