import type { Metadata } from "next";
import Link from "next/link";
import { Backpack, Package } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { BoosterShop } from "@/components/lootboxes/booster-shop";
import { Button } from "@/components/ui/button";
import { loadLootState } from "@/lib/data/inventory";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Luck Boosters" };

export default async function BoostersPage() {
  const ctx = await requireUser();
  const state = await loadLootState(ctx).catch(() => null);
  return (
    <EntranceScope>
      <PageContainer>
        <PageHeader
          title="Luck Boosters"
          description="Premium charges that raise the chance of rarer rewards in your next case openings."
          actions={
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm" className="h-9 px-3">
                <Link href="/shop/cases">
                  <Package aria-hidden />
                  Cases
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-9 px-3">
                <Link href="/inventory?tab=boosters">
                  <Backpack aria-hidden />
                  Inventory
                </Link>
              </Button>
            </div>
          }
        />
        <BoosterShop state={state} />
      </PageContainer>
    </EntranceScope>
  );
}
