import { z } from "zod";
import { requireAdminApi } from "@/lib/admin";
import { dbError, jsonResponse } from "@/lib/http";
import type { AdminAccount } from "@/lib/vault-admin";

/** Account lookup for allowlists (administrators only): by name, email or account id, or `ids` (comma separated). */
export async function GET(request: Request) {
  const ctx = await requireAdminApi();
  if (ctx instanceof Response) return ctx;
  const params = new URL(request.url).searchParams;
  const ids = (params.get("ids") ?? "").split(",").filter((id) => z.uuid().safeParse(id).success).slice(0, 500);
  const query = (params.get("q") ?? "").slice(0, 100);
  const { data, error } = ids.length
    ? await ctx.supabase.rpc("admin_vault_accounts", { p_ids: ids })
    : await ctx.supabase.rpc("admin_vault_accounts", { p_query: query });
  if (error) return dbError(error, "Accounts couldn’t be searched. Try again.");
  return jsonResponse({ accounts: (data ?? []) as AdminAccount[] });
}
