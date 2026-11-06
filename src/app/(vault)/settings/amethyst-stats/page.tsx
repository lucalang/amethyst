import type { Metadata } from "next";
import { Suspense } from "react";
import codeStats from "@/lib/code-stats.json";
import { requireUser } from "@/lib/supabase/auth";
import { SettingsHeader } from "../settings-ui";
import { StatsHistoryProvider, type StatsSnapshot } from "../stats-history";
import { StatsLoading } from "../stats-ui";
import { AmethystStatsView, type CodeStats } from "./amethyst-stats";

export const metadata: Metadata = { title: "Amethyst Stats · Settings" };

type Raw = Record<string, number | undefined>;

export default function AmethystStatsPage() {
  return <><SettingsHeader title="Amethyst Stats" description="Totals across everyone using Amethyst. Only aggregate counts are shown; nothing here identifies a person or their content." /><Suspense fallback={<StatsLoading />}><AmethystStatsData /></Suspense></>;
}

async function AmethystStatsData() {
  const ctx = await requireUser();
  const [{ data, error }, recorded] = await Promise.all([
    ctx.supabase.rpc("stats_history", { p_scope: "amethyst" }),
    ctx.supabase.rpc("stats_recorded_history", { p_scope: "amethyst" }),
  ]);
  if (error || recorded.error) throw new Error("Amethyst Stats could not be loaded.");
  const result = data as { current: Raw; history: StatsSnapshot[] };
  const raw = result.current;
  const n = (key: string) => Number(raw[key] ?? 0);
  const coins = { arcade: n("coins_arcade"), codes: n("coins_codes"), achievements: n("coins_achievements") };

  return (
    <StatsHistoryProvider history={result.history} reconstructed={recorded.data as StatsSnapshot[]}>
      <AmethystStatsView
        computedAt={new Date().toISOString()}
        platform={{
          collections: n("collections"),
          entries: n("entries"),
          checklistTasks: n("checklist_tasks"),
          todoTasks: n("todo_tasks"),
          coins: { ...coins, total: coins.arcade + coins.codes + coins.achievements },
          redemptions: { total: n("redemptions"), repeats: n("redemptions") - n("redemption_pairs") },
          cosmeticsGranted: n("cosmetics_granted"),
        }}
        code={codeStats as CodeStats}
      />
    </StatsHistoryProvider>
  );
}
