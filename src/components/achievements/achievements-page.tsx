"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { Check, Coins, EyeOff, Gift, Loader2, Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { CatalogEmpty, CatalogSearch } from "@/components/catalog/catalog-search";
import { PageContainer } from "@/components/layout/app-shell";
import { useCosmetics } from "@/components/layout/cosmetics-context";
import { ProfileAvatar } from "@/components/layout/profile-avatar";
import { useSettings } from "@/components/layout/settings-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AchievementBadge, BADGE_STYLES, badgeVars } from "@/components/achievements/achievement-badge";
import { replayAchievementCelebration } from "@/components/achievements/achievement-notifications";
import { RewardItemVisual, rewardCustomizeHref, rewardKindLabel } from "@/components/achievements/reward-visual";
import {
  ACHIEVEMENTS,
  ARCADE_GAME_FILTERS,
  REWARD_FILTERS,
  isAchievementRevealed,
  matchesRewardFilter,
  type AchievementDefinition,
  type AchievementGroup,
  type RewardFilter,
} from "@/lib/achievements";
import { apiFetch } from "@/lib/api-client";
import { catalogMatcher } from "@/lib/catalog-search";
import { rewardItemInfo } from "@/lib/cosmetics";
import type { AchievementCardData } from "@/lib/data/achievements";
import { cn } from "@/lib/utils";

type Filter = "all" | "earned" | "in-progress" | "locked";
type Definition = AchievementDefinition;

const GROUPS: AchievementGroup[] = ["Arcade", "Archive", "Discovery"];
const GAME_IDS = new Set<string>(ARCADE_GAME_FILTERS.map((game) => game.id));
const gameOf = (definition: Definition) => definition.game;

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
  const [rewardFilter, setRewardFilter] = useState<RewardFilter>("all");
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const byId = new Map(items.map((item) => [item.id, item]));
  const earnedCount = items.filter((item) => item.earnedAt).length;
  const arcadeScope = groupFilter === "Arcade" || GAME_IDS.has(groupFilter);
  const match = catalogMatcher(query);
  const visible = ACHIEVEMENTS.filter((definition) => {
    const item = byId.get(definition.id);
    if (!item) return false;
    const revealed = isAchievementRevealed(definition, item);
    if (filter === "earned" && !item.earnedAt) return false;
    if (filter === "locked" && item.earnedAt) return false;
    if (filter === "in-progress" && (item.earnedAt || item.progress >= definition.target || !revealed)) return false;
    if (groupFilter !== "all" && groupFilter !== definition.group && groupFilter !== gameOf(definition)) return false;
    if (!matchesRewardFilter(definition, rewardFilter, revealed)) return false;
    if (match) {
      if (!revealed) {
        return match("Hidden achievement", "Secret milestone", BADGE_STYLES[definition.group].label, definition.group);
      }
      const game = ARCADE_GAME_FILTERS.find((entry) => entry.id === gameOf(definition));
      const rewardTerms = [
        definition.reward.coins > 0 ? `${definition.reward.coins} coins` : null,
        ...definition.reward.items.flatMap((id) => [rewardItemInfo(id).name, rewardKindLabel(id)]),
      ];
      return match(definition.name, definition.description, BADGE_STYLES[definition.group].label, definition.group, game?.title, ...rewardTerms);
    }
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

      <div className="enter mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CatalogSearch value={query} onChange={setQuery} label="Search achievements" placeholder="Search medals or rewards" className="sm:w-80" />
        <div role="group" aria-label="Filter by reward" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:px-0">
          {REWARD_FILTERS.map((entry) => (
            <Chip key={entry.id} size="sm" pressed={rewardFilter === entry.id} onClick={() => setRewardFilter(entry.id)}>
              {entry.id === "coins" ? <Coins aria-hidden className="coin-ink size-3.5" /> : entry.id !== "all" ? <Gift aria-hidden className="size-3.5 text-amethyst" /> : null}
              {entry.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="enter mb-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div role="group" aria-label="Filter by status" className="flex w-full rounded-md border border-white/[0.1] bg-white/[0.02] p-0.5 sm:w-auto">
          {([
            ["all", "All"],
            ["earned", "Earned"],
            ["in-progress", "In progress"],
            ["locked", "Locked"],
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
        <CatalogEmpty
          query={query}
          onReset={() => {
            setQuery("");
            setFilter("all");
            setGroupFilter("all");
            setRewardFilter("all");
          }}
        />
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        {detail ? (
          <AchievementDetails
            definition={detail}
            item={byId.get(detail.id)}
            owner={owner}
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
  const totalCoinsEarned = ACHIEVEMENTS.reduce((sum, def) => {
    const card = byId.get(def.id);
    return sum + (card?.rewardGrantedAt ? card.coinsGranted : card?.earnedAt ? def.reward.coins : 0);
  }, 0);
  const totalItemsEarned = ACHIEVEMENTS.reduce((sum, def) => {
    const card = byId.get(def.id);
    return sum + (card?.earnedAt ? def.reward.items.length : 0);
  }, 0);
  const totalItemsAvailable = ACHIEVEMENTS.reduce((sum, def) => sum + def.reward.items.length, 0);

  return (
    <header className="enter relative mb-6 overflow-hidden rounded-lg border border-white/[0.08] bg-[radial-gradient(70%_120%_at_0%_0%,rgb(var(--accent-rgb)/0.14),transparent_60%)] bg-surface/50">
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 pt-4 pb-3.5 sm:gap-5 sm:px-5 sm:pt-5">
        <div className="flex min-w-0 items-center gap-4 sm:gap-5">
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
              <span className="font-semibold text-foreground tabular-nums">{Math.round(ratio * 100)}% complete.</span> Medals for play, archive milestones and discoveries — each with a one-time reward of coins or exclusive cosmetics.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 font-medium tabular-nums">
            <Coins aria-hidden className="coin-ink size-3.5" />
            <span className="coin-ink font-semibold">+{totalCoinsEarned.toLocaleString("en")}</span>
            <span className="text-muted-foreground">milestone coins</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 font-medium tabular-nums">
            <Gift aria-hidden className="size-3.5 text-amethyst" />
            <span className="font-semibold text-foreground">{totalItemsEarned}/{totalItemsAvailable}</span>
            <span className="text-muted-foreground">exclusive items</span>
          </span>
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

function TileRewardPill({ definition, revealed, rewardGranted }: { definition: Definition; revealed: boolean; rewardGranted: boolean }) {
  if (!revealed) {
    return (
      <span className="mt-2 inline-flex max-w-full items-center gap-1 rounded-md border border-white/[0.07] bg-white/[0.025] px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        <EyeOff aria-hidden className="size-3 shrink-0" />
        <span className="truncate">Hidden reward</span>
      </span>
    );
  }
  const { coins, items } = definition.reward;
  const firstItem = items[0] ? rewardItemInfo(items[0]) : null;
  const extraCount = items.length > 1 ? items.length - 1 : 0;
  return (
    <span
      className={cn(
        "mt-2 inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-md border px-2 py-0.5 text-[11px] font-medium",
        rewardGranted ? "border-amethyst/35 bg-amethyst/[0.09] text-foreground" : "border-white/[0.08] bg-white/[0.03] text-muted-foreground",
      )}
    >
      {coins > 0 ? (
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Coins aria-hidden className="coin-ink size-3 shrink-0" />
          <span className="coin-ink font-semibold">+{coins}</span>
        </span>
      ) : null}
      {firstItem ? (
        <span className="inline-flex min-w-0 items-center gap-1 truncate">
          <Gift aria-hidden className="size-3 shrink-0 text-amethyst" />
          <span className="truncate text-foreground/90">{firstItem.name}</span>
          {extraCount > 0 ? <span className="text-muted-foreground">+{extraCount}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

function AchievementTile({ definition, item, onOpen }: { definition: Definition; item: AchievementCardData; onOpen: () => void }) {
  const earned = Boolean(item.earnedAt);
  const rewardGranted = Boolean(item.rewardGrantedAt);
  const revealed = isAchievementRevealed(definition, item);
  const progress = Math.min(item.progress, definition.target);
  const percent = Math.min(100, (progress / definition.target) * 100);
  const badgeDef = revealed ? definition : { icon: "HelpCircle", group: definition.group };
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
      <AchievementBadge achievement={badgeDef} earned={earned} size={84} />
      <span className="mt-1.5 block w-full min-w-0">
        <span className={cn("block text-[13px] leading-snug font-semibold text-balance sm:text-sm", !earned && "text-foreground/85")}>
          {revealed ? definition.name : "Hidden achievement"}
        </span>
        <span className="mt-1 line-clamp-3 block text-xs leading-[1.45] text-muted-foreground">
          {revealed ? definition.description : "Keep exploring Amethyst to reveal this milestone."}
        </span>
      </span>
      <TileRewardPill definition={definition} revealed={revealed} rewardGranted={rewardGranted} />
      <span className="mt-auto block w-full pt-2">
        {earned ? (
          <span className="flex flex-col items-center gap-0.5 text-[11px] font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-1.5 rotate-45 rounded-[1px] bg-[#e7b546] shadow-[0_0_6px_#e7b546]" />
              <span suppressHydrationWarning>Unlocked {new Date(item.earnedAt!).toLocaleDateString(undefined, { dateStyle: "medium" })}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] text-amethyst">
              <Check aria-hidden className="size-3" />
              {rewardGranted ? "Reward granted" : "Unlocked"}
            </span>
          </span>
        ) : revealed ? (
          <>
            <span className="sr-only">Locked. </span>
            <span className="ach-meter block" aria-hidden>
              <span style={{ width: `${percent}%` }} />
            </span>
            <span className="mt-1.5 block text-[11px] font-medium text-muted-foreground tabular-nums">{formatProgress(progress, definition.target, definition.unit)}</span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <Lock aria-hidden className="size-3" />
            Locked · Hidden goal
          </span>
        )}
      </span>
    </button>
  );
}

function AchievementDetails({
  definition,
  item,
  owner,
  onReplay,
}: {
  definition: Definition;
  item: AchievementCardData | undefined;
  owner: CabinetOwner;
  onReplay: () => void;
}) {
  const router = useRouter();
  const cosmetics = useCosmetics();
  const preferences = useSettings();
  const [equipping, setEquipping] = useState<string | null>(null);
  const [equippedLocal, setEquippedLocal] = useState<Record<string, boolean>>({});
  const earned = Boolean(item?.earnedAt);
  const rewardGranted = Boolean(item?.rewardGrantedAt);
  const revealed = isAchievementRevealed(definition, item);
  const progress = earned ? definition.target : Math.min(item?.progress ?? 0, definition.target);
  const ratio = progress / definition.target;
  const { emblem: Emblem, label } = BADGE_STYLES[definition.group];
  const game = ARCADE_GAME_FILTERS.find((entry) => entry.id === gameOf(definition));
  const ringSize = 196;
  const radius = ringSize / 2 - 4;
  const circumference = 2 * Math.PI * radius;
  const badgeDef = revealed ? definition : { icon: "HelpCircle", group: definition.group };

  function isItemEquipped(id: string) {
    if (id in equippedLocal) return equippedLocal[id];
    const { kind } = rewardItemInfo(id);
    if (kind === "frame") return preferences.artworkFrame === id;
    if (kind === "avatar_decoration") return cosmetics.avatarDecoration === id;
    if (kind === "badge") return cosmetics.badge === id;
    if (kind === "title") return cosmetics.title === id;
    return false;
  }

  async function equipItem(id: string) {
    if (equipping) return;
    setEquipping(id);
    try {
      await apiFetch("/api/shop/equip", { method: "POST", json: { item: id } });
      const info = rewardItemInfo(id);
      setEquippedLocal((current) => ({ ...current, [id]: true }));
      toast.success(`${info.name} equipped`);
      router.refresh();
    } catch {
      toast.error("Could not equip that reward right now.");
    } finally {
      setEquipping(null);
    }
  }

  return (
    <DialogContent className="max-h-[90dvh] gap-0 overflow-y-auto p-0 sm:max-w-md" style={badgeVars(definition.group) as CSSProperties}>
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
              strokeDashoffset={circumference * (1 - (revealed ? ratio : 0))}
              style={{ stroke: "rgb(var(--ach-glow))", filter: "drop-shadow(0 0 4px rgb(var(--ach-glow) / 0.6))" }}
            />
          </svg>
        ) : null}
        <AchievementBadge key={definition.id} achievement={badgeDef} earned={earned} size={148} motion="reveal" />
      </div>
      <div className="px-5 pt-5 pb-4">
        <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Emblem aria-hidden className="size-3.5 text-[rgb(var(--ach-glow))]" />
          {label}
          {revealed && game ? <span className="font-normal">· {game.title}</span> : null}
          {definition.hidden ? (
            <span className="rounded-full border border-white/[0.12] bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {revealed ? "Secret milestone" : "Hidden"}
            </span>
          ) : null}
        </p>
        <DialogTitle className="mt-2 text-xl leading-tight font-bold">
          {revealed ? definition.name : "Hidden achievement"}
        </DialogTitle>
        <DialogDescription className="mt-1.5 text-sm leading-6">
          {revealed ? definition.description : "Keep exploring Amethyst to reveal this hidden milestone and its exclusive reward."}
        </DialogDescription>

        <dl className="mt-4 grid gap-3 rounded-md border border-white/[0.08] bg-white/[0.02] p-3.5 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">Goal</dt>
            <dd className="text-right font-medium">{revealed ? formatGoal(definition.target, definition.unit) : "Hidden until discovered"}</dd>
          </div>
          {revealed ? (
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
          ) : null}
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="text-right font-medium" suppressHydrationWarning>
              {earned ? `Unlocked ${new Date(item!.earnedAt!).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}` : "Locked"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">Reward state</dt>
            <dd className="text-right font-medium" suppressHydrationWarning>
              {rewardGranted
                ? `Reward granted ${new Date(item!.rewardGrantedAt!).toLocaleDateString(undefined, { dateStyle: "medium" })}`
                : earned
                  ? "Unlocked · reward pending"
                  : "Granted once on unlock"}
            </dd>
          </div>
        </dl>

        <div className="mt-4 rounded-md border border-white/[0.08] bg-white/[0.02] p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {definition.reward.items.length + (definition.reward.coins > 0 ? 1 : 0) > 1 ? "Milestone rewards" : "Milestone reward"}
            </h3>
            {rewardGranted ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amethyst/15 px-2 py-0.5 text-[11px] font-semibold text-amethyst ring-1 ring-amethyst/35">
                <Check aria-hidden className="size-3" />
                Reward granted
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Lock aria-hidden className="size-3" />
                Locked
              </span>
            )}
          </div>

          {!revealed ? (
            <p className="mt-2.5 flex items-center gap-2 text-xs text-muted-foreground">
              <EyeOff aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              Unlock this hidden achievement to reveal its exclusive reward.
            </p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {definition.reward.coins > 0 ? (
                <li className="flex items-center gap-3 rounded-md border border-white/[0.07] bg-white/[0.02] p-2.5">
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-md bg-warning/15 ring-1 ring-warning/35">
                    <Coins className="coin-ink size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground">Arcade wallet</p>
                    <p className="coin-ink text-sm font-bold tabular-nums">
                      +{(rewardGranted && item?.coinsGranted ? item.coinsGranted : definition.reward.coins).toLocaleString("en")} coins
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {rewardGranted ? "Credited to your wallet (exempt from daily play limit)." : "One-time milestone bonus; does not count toward the daily limit."}
                    </p>
                  </div>
                </li>
              ) : null}

              {definition.reward.items.map((id) => {
                const info = rewardItemInfo(id);
                const owned = cosmetics.owned.includes(id) || Boolean(item?.itemsGranted.includes(id));
                const alreadyOwnedAtGrant = Boolean(item?.itemsAlreadyOwned.includes(id));
                const equipped = isItemEquipped(id);
                return (
                  <li key={id} className="flex items-center gap-3 rounded-md border border-white/[0.07] bg-white/[0.02] p-2.5">
                    <RewardItemVisual id={id} size="md" owner={owner} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-medium text-muted-foreground">{rewardKindLabel(id)}</span>
                        {alreadyOwnedAtGrant ? (
                          <span className="rounded-full border border-white/15 px-1.5 py-0.2 text-[10px] text-muted-foreground">Already in inventory</span>
                        ) : rewardGranted ? (
                          <span className="rounded-full bg-amethyst/15 px-1.5 py-0.2 text-[10px] font-medium text-amethyst">Granted</span>
                        ) : owned ? (
                          <span className="rounded-full border border-white/15 px-1.5 py-0.2 text-[10px] text-muted-foreground">Owned</span>
                        ) : null}
                      </div>
                      <p className="text-sm font-semibold">{info.name}</p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{info.description}</p>
                      {owned ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {equipped ? (
                            <span className="inline-flex h-7 items-center gap-1 text-xs font-semibold text-amethyst">
                              <Check aria-hidden className="size-3.5" />
                              Equipped
                            </span>
                          ) : (
                            <Button type="button" size="sm" variant="secondary" className="h-7 px-2.5 text-xs" disabled={equipping !== null} onClick={() => void equipItem(id)}>
                              {equipping === id ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : null}
                              Equip
                            </Button>
                          )}
                          <Link href={rewardCustomizeHref(id)} className="text-xs font-medium text-amethyst underline-offset-4 hover:underline">
                            Customize
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-white/[0.08] px-5 py-4 sm:flex-row sm:justify-end">
        {earned && revealed ? (
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