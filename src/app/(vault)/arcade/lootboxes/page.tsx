import type { Metadata } from "next";
import Link from "next/link";
import { Backpack, Gamepad2 } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { LootboxShop } from "@/components/lootboxes/lootbox-shop";
import { Button } from "@/components/ui/button";
import { loadLootState } from "@/lib/data/inventory";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Lootboxes" };

export default async function LootboxesPage() {
  const ctx = await requireUser();
  const state = await loadLootState(ctx).catch(() => null);
  return (
    <EntranceScope>
      <PageContainer>
        <PageHeader
          title="Lootboxes"
          description="Buy cases with Coins and open them in your Inventory for cosmetics. Every reward and its exact chance is listed below."
          actions={
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm" className="h-9 px-3">
                <Link href="/arcade">
                  <Gamepad2 aria-hidden />
                  Arcade
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-9 px-3">
                <Link href="/inventory">
                  <Backpack aria-hidden />
                  Inventory
                </Link>
              </Button>
            </div>
          }
        />
        <LootboxShop state={state} />
      </PageContainer>
    </EntranceScope>
  );
}
