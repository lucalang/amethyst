import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/app-shell";
import { SecretVault } from "@/components/vault/secret-vault";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "The Vault" };

export default async function VaultPage() {
  const ctx = await requireUser();
  const { data } = await ctx.supabase
    .from("secret_code_redemptions")
    .select("redeemed_at, coins, items")
    .eq("user_id", ctx.userId)
    .order("redeemed_at", { ascending: false })
    .limit(50);
  const finds = (data ?? []).map((row) => ({ redeemedAt: row.redeemed_at, coins: row.coins, items: row.items }));

  return (
    <PageContainer>
      <SecretVault finds={finds} />
    </PageContainer>
  );
}
