"use client";

import { useState } from "react";
import { LockKeyhole, Trophy } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { AchievementIcon } from "@/components/achievements/achievement-icon";
import { ACHIEVEMENTS, ARCADE_GAME_FILTERS, type AchievementGroup } from "@/lib/achievements";
import type { AchievementCardData } from "@/lib/data/achievements";
import { cn } from "@/lib/utils";

type Filter = "all" | "earned" | "in-progress";

const GROUPS: AchievementGroup[] = ["Arcade", "Archive", "Discovery"];

function formatProgress(value: number, target: number, unit: string) {
  if (unit === "%") return `${Math.min(value, target)}%`;
  return `${Math.min(value, target).toLocaleString("en")}/${target.toLocaleString("en")} ${unit}`;
}

export function AchievementsPage({ items }: { items: AchievementCardData[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const byId = new Map(items.map((item) => [item.id, item]));
  const earnedCount = items.filter((item) => item.earnedAt).length;
  const visible = ACHIEVEMENTS.filter((definition) => {
    const item = byId.get(definition.id);
    if (!item) return false;
    if (filter === "earned" && !item.earnedAt) return false;
    if (filter === "in-progress" && (item.earnedAt || item.progress >= definition.target)) return false;
    if (groupFilter !== "all" && groupFilter !== definition.group && !("game" in definition && groupFilter === definition.game)) return false;
    return true;
  });

  return (
    <PageContainer>
      <PageHeader
        title="Achievements"
        description="Personal milestones from your Arcade sessions, saved archive work, and discoveries. Achievements are recognition only; they do not unlock rewards or features."
      />
      <section aria-label="Achievement progress" className="mb-7 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-white/[0.08] py-4">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <Trophy aria-hidden className="size-4 text-amethyst" />
          {earnedCount} of {ACHIEVEMENTS.length} earned
        </span>
        <span className="text-sm text-muted-foreground">{ACHIEVEMENTS.length - earnedCount} still in progress</span>
      </section>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Filter achievements" className="flex rounded-md border border-white/[0.1] p-0.5">
          {([
            ["all", "All"],
            ["earned", "Earned"],
            ["in-progress", "In progress"],
          ] as const).map(([value, label]) => (
            <Button key={value} type="button" size="sm" variant={filter === value ? "secondary" : "ghost"} aria-pressed={filter === value} onClick={() => setFilter(value)} className="h-8 px-3">
              {label}
            </Button>
          ))}
        </div>
        <label className="flex min-h-9 items-center gap-2 text-sm text-muted-foreground">
          <span>Group</span>
          <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)} className="h-9 max-w-[min(18rem,65vw)] rounded-md border border-white/[0.12] bg-background px-2.5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="all">All groups and games</option>
            {GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
            <optgroup label="Arcade games">
              {ARCADE_GAME_FILTERS.map((game) => <option key={game.id} value={game.id}>{game.title}</option>)}
            </optgroup>
          </select>
        </label>
      </div>

      {visible.length ? GROUPS.map((group) => {
        const groupItems = visible.filter((definition) => definition.group === group);
        if (!groupItems.length) return null;
        return (
          <section key={group} aria-labelledby={`achievements-${group.toLowerCase()}`} className="mb-9">
            <h2 id={`achievements-${group.toLowerCase()}`} className="mb-3 border-b border-white/[0.08] pb-2 text-base font-semibold">{group}</h2>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {groupItems.map((definition) => {
                const item = byId.get(definition.id)!;
                const earned = Boolean(item.earnedAt);
                const progress = Math.min(item.progress, definition.target);
                const percent = Math.min(100, (progress / definition.target) * 100);
                return (
                  <li key={definition.id} id={definition.id} className={cn("min-w-0 rounded-lg border p-4", earned ? "border-amethyst/35 bg-amethyst/[0.06]" : "border-white/[0.09] bg-surface/35")}>
                    <div className="flex items-start gap-3">
                      <span className={cn("relative grid size-10 shrink-0 place-items-center rounded-md border", earned ? "border-amethyst/35 bg-amethyst/10 text-amethyst" : "border-white/[0.1] bg-white/[0.025] text-muted-foreground")}>
                        <AchievementIcon name={definition.icon} className="size-5" />
                        {!earned ? <span className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full border border-background bg-muted text-muted-foreground"><LockKeyhole aria-hidden className="size-2.5" /></span> : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                          <h3 className="text-sm font-semibold">{definition.name}</h3>
                          {earned ? <span className="text-[11px] font-medium text-amethyst">Earned</span> : null}
                        </div>
                        <p className="mt-1 text-sm leading-5 text-muted-foreground">{definition.description}</p>
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                        <span className="text-muted-foreground">{earned ? "Completed" : "Progress"}</span>
                        <span className="font-medium tabular-nums text-foreground">{earned ? formatProgress(definition.target, definition.target, definition.unit) : formatProgress(progress, definition.target, definition.unit)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]" role="progressbar" aria-label={`${definition.name} progress`} aria-valuemin={0} aria-valuemax={definition.target} aria-valuenow={earned ? definition.target : progress}>
                        <div className="h-full rounded-full bg-amethyst transition-[width] motion-reduce:transition-none" style={{ width: `${earned ? 100 : percent}%` }} />
                      </div>
                      {item.earnedAt ? <p className="mt-2 text-[11px] text-muted-foreground">Earned {new Date(item.earnedAt).toLocaleDateString()}</p> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      }) : <p className="border-t border-white/[0.08] py-8 text-sm text-muted-foreground">No achievements match these filters.</p>}
    </PageContainer>
  );
}