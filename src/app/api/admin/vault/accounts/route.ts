import { requireAdminApi } from "@/lib/admin";
import { dbError, jsonResponse } from "@/lib/http";
import type { AdminAccount } from "@/lib/vault-admin";

/** Account lookup for allowlists (administrators only): by name, email or account id. */
export async function GET(request: Request) {
  const ctx = await requireAdminApi();
  if (ctx instanceof Response) return ctx;
  const query = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 100);
  const { data, error } = await ctx.supabase.rpc("admin_vault_accounts", { p_query: query });
  if (error) return dbError(error, "Accounts couldn’t be searched. Try again.");
  return jsonResponse({ accounts: (data ?? []) as AdminAccount[] });
}
