import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Crown } from "lucide-react";
import { TournamentHub } from "@/components/arcade/tournaments";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { Button } from "@/components/ui/button";
import { loadTournamentState } from "@/lib/data/competitive";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Daily Tournament · Arcade" };

export default async function TournamentsPage() {
  const ctx = await requireUser();
  const state = await loadTournamentState(ctx, null).catch(() => null);
  return (
    <EntranceScope>
      <PageContainer>
        <PageHeader
          title="Daily Tournament"
          icon={Crown}
          tone="#a78bfa"
          description="A new game every UTC day. Free to enter: your best run counts, and the top ten win Coins and exclusive flair."
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href="/arcade"><ArrowLeft aria-hidden />Arcade</Link>
            </Button>
          }
        />
        <TournamentHub initial={state} />
      </PageContainer>
    </EntranceScope>
  );
}
