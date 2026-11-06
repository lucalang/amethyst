import type { Metadata } from "next";
import { Suspense } from "react";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { ARCADE_GAMES } from "@/lib/arcade";
import { requireUser } from "@/lib/supabase/auth";
import { SettingsHeader } from "../settings-ui";
import { StatsHistoryProvider, type StatsSnapshot } from "../stats-history";
import { StatsLoading } from "../stats-ui";
import { MyStatsView, type MyStats } from "./my-stats";

export const metadata: Metadata = { title: "Stats · Settings" };

type Raw = Record<string, unknown>;

export default function MyStatsPage() {
  return <><SettingsHeader title="Stats" description="Your own numbers across the archive, To Do and the Arcade." /><Suspense fallback={<StatsLoading />}><MyStatsData /></Suspense></>;
}

async function MyStatsData() {
  const ctx = await requireUser();
  const [{ data, error }, recorded] = await Promise.all([
    ctx.supabase.rpc("stats_history", { p_scope: "personal" }),
    ctx.supabase.rpc("stats_recorded_history", { p_scope: "personal" }),
  ]);
  if (error || recorded.error) throw new Error("Your stats could not be loaded.");
  const result = data as { current: Raw; history: StatsSnapshot[] };
  const raw = result.current;
  const n = (key: string) => Number(raw[key] ?? 0);
  const favorite = typeof raw.favorite_game === "string" ? raw.favorite_game : null;

  const stats: MyStats = {
    memberSince: typeof raw.member_since === "string" ? raw.member_since : null,
    library: {
      collections: n("collections"),
      entries: n("entries"),
      added30d: n("entries_30d"),
      completed: n("entries_completed"),
      inProgress: n("entries_in_progress"),
      pinned: n("pinned"),
      progressDone: n("progress_done"),
      progressTotal: n("progress_total"),
    },
    workspace: {
      notes: n("notes"),
      checklists: n("checklists"),
      quickNotes: n("quick_notes"),
      items: n("checklist_items"),
      itemsDone: n("checklist_done"),
      starredOpen: n("checklist_starred_open"),
    },
    todo: { total: n("todo_total"), completed: n("todo_completed"), completed7d: n("todo_completed_7d"), importantOpen: n("todo_important_open") },
    arcade: {
      balance: n("coins_balance"),
      coinsIn: n("coins_in"),
      coinsOut: n("coins_out"),
      runs: n("runs"),
      favoriteGame: favorite ? (ARCADE_GAMES.find((game) => game.id === favorite)?.title ?? favorite) : null,
      records: n("records"),
      dailySudokus: n("daily_sudokus"),
      slotSpins: n("slot_spins"),
      slotBest: n("slot_best"),
    },
    rewards: { achievements: n("achievements"), achievementsTotal: ACHIEVEMENTS.length, cosmetics: n("cosmetics"), codes: n("codes") },
  };

  return (
    <StatsHistoryProvider history={result.history} reconstructed={recorded.data as StatsSnapshot[]}>
      <MyStatsView stats={stats} />
    </StatsHistoryProvider>
  );
}
