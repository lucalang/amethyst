import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Swords } from "lucide-react";
import { WagerMatch } from "@/components/arcade/wagers";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { Button } from "@/components/ui/button";
import { loadWagerState } from "@/lib/data/competitive";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Wager · Arcade" };

type Props = { params: Promise<{ id: string }> };

export default async function WagerPage({ params }: Props) {
  const ctx = await requireUser();
  const { id } = await params;
  const state = await loadWagerState(ctx, id);
  if (!state) notFound();
  return (
    <EntranceScope>
      <PageContainer>
        <PageHeader
          title="Wager match"
          icon={Swords}
          tone="#34d399"
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href="/arcade/wagers"><ArrowLeft aria-hidden />Wagers</Link>
            </Button>
          }
        />
        <WagerMatch initial={state} />
      </PageContainer>
    </EntranceScope>
  );
}
