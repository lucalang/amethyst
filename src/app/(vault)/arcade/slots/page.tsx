import type { Metadata } from "next";
import { CoinSlots, type SlotHistoryRow, type SlotStatus } from "@/components/arcade/slots/coin-slots";
import { PageContainer } from "@/components/layout/app-shell";
import { parseSlotMachine, slotOdds } from "@/lib/slots";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Coin Slots · Arcade" };

export default async function SlotsPage() {
  const ctx = await requireUser();
  const [machineRes, statusRes, spinsRes] = await Promise.all([
    ctx.supabase.from("slot_machines").select("id, reels, paytable, bets, daily_wager_limit, max_spins_per_minute").eq("id", "amethyst").maybeSingle(),
    ctx.supabase.rpc("slot_status"),
    ctx.supabase.from("slot_spins").select("id, bet, symbols, payout, created_at").eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(10),
  ]);
  const machine = machineRes.data ? parseSlotMachine(machineRes.data) : null;
  const status = statusRes.data as SlotStatus | null;

  if (!machine || !status) {
    return (
      <PageContainer>
        <p role="status" className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
          Coin Slots is closed for maintenance right now. Your coins are safe; try again later.
        </p>
      </PageContainer>
    );
  }

  const history: SlotHistoryRow[] = (spinsRes.data ?? []).map((row) => ({ id: row.id, bet: row.bet, symbols: row.symbols, payout: row.payout, createdAt: row.created_at }));
  return <CoinSlots machine={machine} odds={slotOdds(machine)} status={status} history={history} />;
}
