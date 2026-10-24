"use client";

import { useEffect, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { PageContainer } from "@/components/layout/app-shell";
import { ProfileAvatar } from "@/components/layout/profile-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AchievementBadge, BADGE_STYLES, badgeVars } from "@/components/achievements/achievement-badge";
import { replayAchievementCelebration } from "@/components/achievements/achievement-notifications";
import { ACHIEVEMENTS, ARCADE_GAME_FILTERS, type AchievementGroup } from "@/lib/achievements";
import type { AchievementCardData } from "@/lib/data/achievements";
import { cn } from "@/lib/utils";

type Filter = "all" | "earned" | "in-progress";
type Definition = (typeof ACHIEVEMENTS)[number];

const GROUPS: AchievementGroup[] = ["Arcade", "Archive", "Discovery"];
const GAME_IDS = new Set<string>(ARCADE_GAME_FILTERS.map((game) => game.id));
const gameOf = (definition: Definition) => ("game" in definition ? definition.game : undefined);

function formatProgress(value: number, target: number, unit: string) {
  if (unit === "%") return `${Math.min(value, target)}%`;
  return `${Math.min(value, target).toLocaleString("en")}/${target.toLocaleString("en")} ${unit}`;
}

function formatGoal(target: number, unit: string) {
  return unit === "%" ? "100% progress" : `${target.toLocaleString("en")} ${unit}`;
}

function tilt(event: PointerEvent<HTMLElement>) {
  if (event.pointerType !== "mouse") return;
  const rect = event.currentTarget.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width - 0.5;
  const y = (event.clientY - rect.top) / rect.height - 0.5;
  event.currentTarget.style.setProperty("--ach-rx", `${(-y * 18).toFixed(2)}deg`);
  event.currentTarget.style.setProperty("--ach-ry", `${(x * 22).toFixed(2)}deg`);
}

function untilt(event: PointerEvent<HTMLElement>) {
  event.currentTarget.style.removeProperty("--ach-rx");
  event.currentTarget.style.removeProperty("--ach-ry");
}

export type CabinetOwner = { name: string; avatarUrl: string | null };

export function AchievementsPage({ items, owner }: { items: AchievementCardData[]; owner: CabinetOwner }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const byId = new Map(items.map((item) => [item.id, item]));
  const earnedCount = items.filter((item) => item.earnedAt).length;
  const arcadeScope = groupFilter === "Arcade" || GAME_IDS.has(groupFilter);
  const visible = ACHIEVEMENTS.filter((definition) => {
    const item = byId.get(definition.id);
    if (!item) return false;
    if (filter === "earned" && !item.earnedAt) return false;
    if (filter === "in-progress" && (item.earnedAt || item.progress >= definition.target)) return false;
    if (groupFilter !== "all" && groupFilter !== definition.group && groupFilter !== gameOf(definition)) return false;
    return true;
  });

  useEffect(() => {
    const ids = new Set(items.map((item) => item.id));
    const open = (id: string) => {
      if (!ids.has(id)) return;
      setDetailId(id);
      setDetailOpen(true);
    };
    const fromHash = () => open(decodeURIComponent(window.location.hash.slice(1)));
    const fromEvent = (event: Event) => open(String((event as CustomEvent<string>).detail));
    const frame = window.requestAnimationFrame(fromHash);
    window.addEventListener("hashchange", fromHash);
    window.addEventListener("archive:achievement-open", fromEvent);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", fromHash);
      window.removeEventListener("archive:achievement-open", fromEvent);
    };
  }, [items]);

  const openDetail = (id: string) => {
    setDetailId(id);
    setDetailOpen(true);
  };
  const detail = detailId ? ACHIEVEMENTS.find((definition) => definition.id === detailId) : undefined;

  return (
    <PageContainer>
      <CabinetHeader byId={byId} earnedCount={earnedCount} owner={owner} />

      <div className="enter mb-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div role="group" aria-label="Filter by status" className="flex w-full rounded-md border border-white/[0.1] bg-white/[0.02] p-0.5 sm:w-auto">
          {([
            ["all", "All"],
            ["earned", "Earned"],
            ["in-progress", "In progress"],
          ] as const).map(([value, label]) => (
            <Button key={value} type="button" size="sm" variant={filter === value ? "secondary" : "ghost"} aria-pressed={filter === value} onClick={() => setFilter(value)} className="h-8 flex-1 px-3 sm:flex-none">
              {label}
            </Button>
          ))}
        </div>
        <div role="group" aria-label="Filter by group" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:px-0">
          <Chip pressed={groupFilter === "all"} onClick={() => setGroupFilter("all")}>All groups</Chip>
          {GROUPS.map((group) => {
            const { emblem: Emblem, label } = BADGE_STYLES[group];
            return (
              <Chip key={group} group={group} pressed={groupFilter === group || (group === "Arcade" && arcadeScope)} onClick={() => setGroupFilter(group)}>
                <Emblem aria-hidden className="size-3.5 text-[rgb(var(--ach-glow))]" />
                {label}
              </Chip>
            );
          })}
        </div>
      </div>
      {arcadeScope ? (
        <div role="group" aria-label="Filter by Arcade game" className="-mx-4 -mt-4 mb-7 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:justify-end sm:px-0">
          <Chip size="sm" group="Arcade" pressed={groupFilter === "Arcade"} onClick={() => setGroupFilter("Arcade")}>All games</Chip>
          {ARCADE_GAME_FILTERS.map((game) => (
            <Chip key={game.id} size="sm" group="Arcade" pressed={groupFilter === game.id} onClick={() => setGroupFilter(game.id)}>
              {game.title}
            </Chip>
          ))}
        </div>
      ) : null}

      {visible.length ? (
        GROUPS.map((group) => {
          const groupItems = visible.filter((definition) => definition.group === group);
          if (!groupItems.length) return null;
          const all = ACHIEVEMENTS.filter((definition) => definition.group === group);
          const earnedInGroup = all.filter((definition) => byId.get(definition.id)?.earnedAt).length;
          const { emblem: Emblem, label } = BADGE_STYLES[group];
          const headingId = `achievements-${group.toLowerCase()}`;
          return (
            <section key={group} aria-labelledby={headingId} className="enter mb-10" style={badgeVars(group)}>
              <div className="mb-4 flex items-center gap-3">
                <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md bg-[rgb(var(--ach-glow)/0.13)] text-[rgb(var(--ach-glow))] ring-1 ring-[rgb(var(--ach-glow)/0.3)]">
                  <Emblem className="size-4" />
                </span>
                <h2 id={headingId} className="text-base font-semibold">{label}</h2>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {earnedInGroup} of {all.length} earned
                </span>
                <span aria-hidden className="h-px min-w-6 flex-1 bg-gradient-to-r from-[rgb(var(--ach-glow)/0.45)] to-transparent" />
              </div>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6">
                {groupItems.map((definition) => (
                  <li key={definition.id} id={definition.id} className="min-w-0 scroll-mt-28">
                    <AchievementTile definition={definition} item={byId.get(definition.id)!} onOpen={() => openDetail(definition.id)} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      ) : (
        <p className="border-t border-white/[0.08] py-8 text-sm text-muted-foreground">No achievements match these filters.</p>
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        {detail ? (
          <AchievementDetails
            definition={detail}
            item={byId.get(detail.id)}
            onReplay={() => {
              setDetailOpen(false);
              replayAchievementCelebration(detail.id);
            }}
          />
        ) : null}
      </Dialog>
    </PageContainer>
  );
}

function CabinetHeader({ byId, earnedCount, owner }: { byId: Map<string, AchievementCardData>; earnedCount: number; owner: CabinetOwner }) {
  const total = ACHIEVEMENTS.length;
  const ratio = total ? earnedCount / total : 0;
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  return (
    <header className="enter relative mb-6 overflow-hidden rounded-lg border border-white/[0.08] bg-[radial-gradient(70%_120%_at_0%_0%,rgb(var(--accent-rgb)/0.14),transparent_60%)] bg-surface/50">
      <div className="flex items-center gap-4 px-4 pt-4 pb-3.5 sm:gap-5 sm:px-5 sm:pt-5">
        <div className="relative grid size-[72px] shrink-0 place-items-center">
          <svg aria-hidden viewBox="0 0 72 72" className="absolute inset-0 -rotate-90">
            <defs>
              <linearGradient id="ach-gold" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#fff1b8" />
                <stop offset="0.5" stopColor="#e7b546" />
                <stop offset="1" stopColor="#a8701a" />
              </linearGradient>
            </defs>
            <circle cx="36" cy="36" r={radius} fill="none" strokeWidth="5" style={{ stroke: "rgb(var(--ink-rgb) / 0.09)" }} />
            <circle cx="36" cy="36" r={radius} fill="none" stroke="url(#ach-gold)" strokeWidth="5" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - ratio)} />
          </svg>
          <span className="text-center leading-none">
            <span className="block text-xl font-extrabold tabular-nums">{earnedCount}</span>
            <span className="mt-0.5 block text-[10px] font-medium text-muted-foreground">of {total}</span>
          </span>
        </div>
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
            {owner.name || owner.avatarUrl ? <ProfileAvatar name={owner.name} src={owner.avatarUrl} className="size-5 shrink-0 text-[9px]" /> : null}
            <span className="truncate">{owner.name ? `${owner.name}’s cabinet` : "Your cabinet"}</span>
          </p>
          <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight md:text-3xl">Achievements</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">{Math.round(ratio * 100)}% complete.</span> Medals for play, archive milestones and discoveries. Recognition only; nothing to unlock.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2.5 border-t border-white/[0.06] px-4 py-3 sm:px-5">
        {GROUPS.map((group) => {
          const all = ACHIEVEMENTS.filter((definition) => definition.group === group);
          const earned = all.filter((definition) => byId.get(definition.id)?.earnedAt).length;
          return (
            <div key={group} className="flex min-w-0 items-center gap-2.5" style={badgeVars(group)}>
              <span className="text-xs text-muted-foreground">
                {BADGE_STYLES[group].label} <span className="font-semibold text-foreground tabular-nums">{earned}/{all.length}</span>
              </span>
              <span aria-hidden className="flex flex-wrap gap-1.5 py-1" title={`${earned} of ${all.length} ${group} achievements earned`}>
                {all.map((definition) => (
                  <span key={definition.id} className="ach-pip" data-earned={Boolean(byId.get(definition.id)?.earnedAt)} />
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </header>
  );
}

function Chip({
  pressed,
  onClick,
  group,
  size = "md",
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  group?: AchievementGroup;
  size?: "sm" | "md";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      style={group ? badgeVars(group) : undefined}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 font-medium whitespace-nowrap transition-[background-color,border-color,color] outline-none focus-visible:ring-2 focus-visible:ring-ring",
        size === "sm" ? "h-7 text-xs" : "h-8 text-sm",
        pressed
          ? group
            ? "border-[rgb(var(--ach-glow)/0.5)] bg-[rgb(var(--ach-glow)/0.12)] text-foreground"
            : "border-white/[0.18] bg-white/[0.08] text-foreground"
          : "border-white/[0.08] text-muted-foreground hover:border-white/[0.16] hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function AchievementTile({ definition, item, onOpen }: { definition: Definition; item: AchievementCardData; onOpen: () => void }) {
  const earned = Boolean(item.earnedAt);
  const progress = Math.min(item.progress, definition.target);
  const percent = Math.min(100, (progress / definition.target) * 100);
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      className="ach-tile"
      data-state={earned ? "earned" : "locked"}
      style={badgeVars(definition.group)}
      onClick={onOpen}
      onPointerMove={tilt}
      onPointerLeave={untilt}
    >
      <AchievementBadge achievement={definition} earned={earned} size={84} />
      <span className="mt-1.5 block w-full min-w-0">
        <span className={cn("block text-[13px] leading-snug font-semibold text-balance sm:text-sm", !earned && "text-foreground/85")}>{definition.name}</span>
        <span className="mt-1 line-clamp-3 block text-xs leading-[1.45] text-muted-foreground">{definition.description}</span>
      </span>
      <span className="mt-auto block w-full pt-1">
        {earned ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <span aria-hidden className="size-1.5 rotate-45 rounded-[1px] bg-[#e7b546] shadow-[0_0_6px_#e7b546]" />
            <span suppressHydrationWarning>Earned {new Date(item.earnedAt!).toLocaleDateString(undefined, { dateStyle: "medium" })}</span>
          </span>
        ) : (
          <>
            <span className="sr-only">Locked. </span>
            <span className="ach-meter block" aria-hidden>
              <span style={{ width: `${percent}%` }} />
            </span>
            <span className="mt-1.5 block text-[11px] font-medium text-muted-foreground tabular-nums">{formatProgress(progress, definition.target, definition.unit)}</span>
          </>
        )}
      </span>
    </button>
  );
}

function AchievementDetails({ definition, item, onReplay }: { definition: Definition; item: AchievementCardData | undefined; onReplay: () => void }) {
  const earned = Boolean(item?.earnedAt);
  const progress = earned ? definition.target : Math.min(item?.progress ?? 0, definition.target);
  const ratio = progress / definition.target;
  const { emblem: Emblem, label } = BADGE_STYLES[definition.group];
  const game = ARCADE_GAME_FILTERS.find((entry) => entry.id === gameOf(definition));
  const ringSize = 196;
  const radius = ringSize / 2 - 4;
  const circumference = 2 * Math.PI * radius;
  return (
    <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md" style={badgeVars(definition.group) as CSSProperties}>
      <div className="ach-stage" data-state={earned ? "earned" : "locked"} onPointerMove={tilt} onPointerLeave={untilt}>
        <span aria-hidden className="ach-stage-rays" />
        {!earned ? (
          <svg aria-hidden className="ach-ring" width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`}>
            <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} fill="none" strokeWidth="3" style={{ stroke: "rgb(var(--ink-rgb) / 0.1)" }} />
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - ratio)}
              style={{ stroke: "rgb(var(--ach-glow))", filter: "drop-shadow(0 0 4px rgb(var(--ach-glow) / 0.6))" }}
            />
          </svg>
        ) : null}
        <AchievementBadge key={definition.id} achievement={definition} earned={earned} size={148} motion="reveal" />
      </div>
      <div className="px-5 pt-5 pb-4">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Emblem aria-hidden className="size-3.5 text-[rgb(var(--ach-glow))]" />
          {label}
          {game ? <span className="font-normal">· {game.title}</span> : null}
        </p>
        <DialogTitle className="mt-2 text-xl leading-tight font-bold">{definition.name}</DialogTitle>
        <DialogDescription className="mt-1.5 text-sm leading-6">{definition.description}</DialogDescription>
        <dl className="mt-5 grid gap-3 rounded-md border border-white/[0.08] bg-white/[0.02] p-3.5 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">Goal</dt>
            <dd className="text-right font-medium">{formatGoal(definition.target, definition.unit)}</dd>
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Progress</dt>
              <dd className="text-right font-medium tabular-nums">{formatProgress(progress, definition.target, definition.unit)}</dd>
            </div>
            <div
              className="ach-meter mt-2"
              role="progressbar"
              aria-label={`${definition.name} progress`}
              aria-valuemin={0}
              aria-valuemax={definition.target}
              aria-valuenow={progress}
            >
              <span style={{ width: `${ratio * 100}%` }} />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="text-right font-medium">
              {earned ? `Earned ${new Date(item!.earnedAt!).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" })}` : "Not earned yet"}
            </dd>
          </div>
        </dl>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-white/[0.08] px-5 py-4 sm:flex-row sm:justify-end">
        {earned ? (
          <Button type="button" variant="outline" onClick={onReplay}>
            <Sparkles aria-hidden /> Replay celebration
          </Button>
        ) : null}
        <DialogClose asChild>
          <Button type="button">Close</Button>
        </DialogClose>
      </div>
    </DialogContent>
  );
}