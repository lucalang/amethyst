import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Swords } from "lucide-react";
import { WagerHub } from "@/components/arcade/wagers";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { Button } from "@/components/ui/button";
import { loadWagerList } from "@/lib/data/competitive";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Wagers · Arcade" };

export default async function WagersPage() {
  const ctx = await requireUser();
  const state = await loadWagerList(ctx).catch(() => null);
  return (
    <EntranceScope>
      <PageContainer>
        <PageHeader
          title="Wagers"
          icon={Swords}
          tone="#34d399"
          description="Challenge another player to a best-of-five for Coins. Both stakes are held until the match ends, and the winner takes the pot."
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href="/arcade"><ArrowLeft aria-hidden />Arcade</Link>
            </Button>
          }
        />
        <WagerHub initial={state} />
      </PageContainer>
    </EntranceScope>
  );
}
