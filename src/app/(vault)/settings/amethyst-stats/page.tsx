import type { Metadata } from "next";
import codeStats from "@/lib/code-stats.json";
import { requireUser } from "@/lib/supabase/auth";
import { SettingsHeader } from "../settings-ui";
import { AmethystStatsView, type CodeStats } from "./amethyst-stats";

export const metadata: Metadata = { title: "Amethyst Stats · Settings" };

type Raw = Record<string, number | undefined>;

export default async function AmethystStatsPage() {
  const ctx = await requireUser();
  const { data, error } = await ctx.supabase.rpc("amethyst_stats");
  if (error) throw new Error("Amethyst Stats could not be loaded.");
  const raw = (data ?? {}) as Raw;
  const n = (key: string) => Number(raw[key] ?? 0);
  const coins = { arcade: n("coins_arcade"), codes: n("coins_codes"), achievements: n("coins_achievements") };

  return (
    <>
      <SettingsHeader title="Amethyst Stats" description="Totals across everyone using Amethyst. Only aggregate counts are shown; nothing here identifies a person or their content." />
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
    </>
  );
}
