"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, Coins, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { playSound } from "@/components/arcade/sound";
import { useSettings } from "@/components/layout/settings-context";
import { Button } from "@/components/ui/button";
import { AchievementBadge, BADGE_STYLES, badgeVars } from "@/components/achievements/achievement-badge";
import { RewardItemVisual, rewardCustomizeHref, rewardKindLabel } from "@/components/achievements/reward-visual";
import { achievementDefinition, type AchievementNotice } from "@/lib/achievements";
import { apiFetch } from "@/lib/api-client";
import { rewardItemInfo } from "@/lib/cosmetics";

type SingleCelebration = {
  kind: "single";
  id: string;
  earnedAt: string;
  coins: number;
  items: string[];
  newItems: string[];
  alreadyOwnedItems: string[];
  key: string;
  replay: boolean;
};

type BackfillSummary = {
  kind: "summary";
  notices: AchievementNotice[];
  totalCoins: number;
  items: string[];
  alreadyOwnedItems: string[];
  key: string;
  replay: false;
};

type Celebration = SingleCelebration | BackfillSummary;

const SHOW_DELAY_MS = 700;
const VISIBLE_MS = 9000;
const SPARKS = Array.from({ length: 14 }, (_, index) => ({
  "--a": `${index * (360 / 14) + (index % 2 ? 9 : -5)}deg`,
  "--d": `${46 + (index % 3) * 11}px`,
  "--delay": `${640 + (index % 4) * 35}ms`,
  "--spark": index % 3 === 0 ? "#ffe08a" : index % 3 === 1 ? "rgb(var(--ach-glow))" : "#ffffff",
})) as CSSProperties[];

/** Plays the celebration again for an earned achievement. Purely visual: nothing is sent to the server. */
export function replayAchievementCelebration(id: string) {
  window.dispatchEvent(new CustomEvent("archive:achievement-celebrate", { detail: id }));
}

function toSingleCelebration(notice: AchievementNotice, replay: boolean): SingleCelebration | null {
  const def = achievementDefinition(notice.id);
  if (!def) return null;
  const items = Array.isArray(notice.items) ? notice.items : [...def.reward.items];
  return {
    kind: "single",
    id: notice.id,
    earnedAt: notice.earnedAt,
    coins: typeof notice.coins === "number" ? notice.coins : def.reward.coins,
    items,
    newItems: Array.isArray(notice.newItems) ? notice.newItems : items,
    alreadyOwnedItems: Array.isArray(notice.alreadyOwnedItems) ? notice.alreadyOwnedItems : [],
    key: replay ? `replay:${notice.id}:${Date.now()}` : `unlock:${notice.id}`,
    replay,
  };
}

function toBackfillSummary(notices: AchievementNotice[]): BackfillSummary {
  let totalCoins = 0;
  const items: string[] = [];
  const alreadyOwnedItems: string[] = [];
  for (const notice of notices) {
    const def = achievementDefinition(notice.id);
    totalCoins += typeof notice.coins === "number" ? notice.coins : (def?.reward.coins ?? 0);
    const grantedItems = Array.isArray(notice.items) ? notice.items : [...(def?.reward.items ?? [])];
    for (const id of grantedItems) if (!items.includes(id)) items.push(id);
    for (const id of notice.alreadyOwnedItems ?? []) if (!alreadyOwnedItems.includes(id)) alreadyOwnedItems.push(id);
  }
  return {
    kind: "summary",
    notices,
    totalCoins,
    items,
    alreadyOwnedItems,
    key: `backfill:${notices.map((n) => n.id).join(",")}`,
    replay: false,
  };
}

export function AchievementNotifications({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const { settings, update } = useSettings();
  const [queue, setQueue] = useState<Celebration[]>([]);
  const [safeToShow, setSafeToShow] = useState(false);
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [equipping, setEquipping] = useState<string | null>(null);
  const [equippedIds, setEquippedIds] = useState<string[]>([]);
  const seen = useRef(new Set<string>());
  const active = queue[0];
  const allowed = Boolean(active && (enabled || active.replay));

  useEffect(() => {
    const receive = (event: Event) => {
      const notices = (event as CustomEvent<AchievementNotice[]>).detail;
      if (!Array.isArray(notices)) return;
      const added = notices.filter((notice) => achievementDefinition(notice.id) && !seen.current.has(notice.id));
      for (const notice of added) seen.current.add(notice.id);
      const withBalance = [...added].reverse().find((notice) => typeof notice.balance === "number");
      if (withBalance && typeof withBalance.balance === "number") {
        window.dispatchEvent(new CustomEvent("archive:coins", { detail: withBalance.balance }));
      }
      if (!enabled || !added.length) return;

      const backfilled = added.filter((notice) => notice.source === "backfill");
      const live = added.filter((notice) => notice.source !== "backfill");
      const nextItems: Celebration[] = [];
      if (backfilled.length > 1) {
        nextItems.push(toBackfillSummary(backfilled));
      } else if (backfilled.length === 1) {
        const single = toSingleCelebration(backfilled[0], false);
        if (single) nextItems.push(single);
      }
      for (const notice of live) {
        const single = toSingleCelebration(notice, false);
        if (single) nextItems.push(single);
      }
      if (nextItems.length) setQueue((current) => [...current, ...nextItems]);
    };
    const replay = (event: Event) => {
      const id = String((event as CustomEvent<string>).detail);
      const single = toSingleCelebration({ id, earnedAt: "" }, true);
      if (single) setQueue((current) => [...current, single]);
    };
    window.addEventListener("archive:achievement-unlocked", receive);
    window.addEventListener("archive:achievement-celebrate", replay);
    return () => {
      window.removeEventListener("archive:achievement-unlocked", receive);
      window.removeEventListener("archive:achievement-celebrate", replay);
    };
  }, [enabled]);

  useEffect(() => {
    let active = true;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const reconcile = async () => {
      attempts++;
      try {
        const result = await apiFetch<{ achievementUnlocks: AchievementNotice[]; achievementReconciled: boolean }>("/api/achievements/notifications", { signal: controller.signal });
        if (active && (result.achievementReconciled || result.achievementUnlocks.length > 0)) router.refresh();
      } catch {
        if (active && attempts < 3) timer = setTimeout(reconcile, attempts * 2000);
      }
    };
    void reconcile();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [router]);

  useEffect(() => {
    const check = () => {
      const target = document.activeElement;
      const typing = target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
      const playing = document.querySelector("[data-arcade-game][data-game-active='true']");
      setSafeToShow(!document.hidden && !typing && !playing);
    };
    check();
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", check);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("archive:arcade-activity", check);
    const observer = new MutationObserver(check);
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-game-active"] });
    return () => {
      document.removeEventListener("focusin", check);
      document.removeEventListener("focusout", check);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("archive:arcade-activity", check);
      observer.disconnect();
    };
  }, []);

  const activeKey = active?.key;
  useEffect(() => {
    if (!activeKey || !safeToShow || !allowed) return;
    const timer = window.setTimeout(() => setShownKey(activeKey), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [activeKey, allowed, safeToShow]);

  const visible = Boolean(active && allowed && safeToShow && shownKey === active.key);
  const chimePlayedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!visible || !activeKey || chimePlayedFor.current === activeKey) return;
    chimePlayedFor.current = activeKey;
    if (settings.arcadeSound) playSound("win", 1.08);
  }, [visible, activeKey, settings.arcadeSound]);

  useEffect(() => {
    if (!visible || paused) return;
    const timer = window.setTimeout(() => setQueue((current) => current.slice(1)), VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [visible, paused, activeKey]);

  function dismiss() {
    setPaused(false);
    setQueue((current) => current.slice(1));
  }

  function viewSingle(id: string) {
    window.dispatchEvent(new CustomEvent("archive:achievement-open", { detail: id }));
    dismiss();
  }

  async function equipReward(itemId: string) {
    if (equipping) return;
    setEquipping(itemId);
    setPaused(true);
    try {
      await apiFetch("/api/shop/equip", { method: "POST", json: { item: itemId } });
      const info = rewardItemInfo(itemId);
      if (info.kind === "frame") update({ artworkFrame: itemId as typeof settings.artworkFrame });
      setEquippedIds((current) => [...current, itemId]);
      toast.success(`${info.name} equipped`);
      router.refresh();
    } catch {
      toast.error("Could not equip that item right now.");
    } finally {
      setEquipping(null);
    }
  }

  const singleDef = active?.kind === "single" ? achievementDefinition(active.id) : undefined;
  const groupForVars = singleDef ? singleDef.group : "Discovery";

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[120] flex justify-end md:inset-x-auto md:right-6 md:bottom-6"
    >
      {visible && active ? (
        <aside
          key={active.key}
          aria-label="Achievement unlocked"
          className="ach-toast pointer-events-auto w-full md:w-[28rem]"
          style={badgeVars(groupForVars)}
          onPointerEnter={() => setPaused(true)}
          onPointerLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          {active.kind === "single" && singleDef ? (
            <div className="flex items-start gap-4 p-4 pr-11">
              <div className="relative mt-0.5 grid size-[76px] shrink-0 place-items-center">
                <span aria-hidden className="ach-burst">
                  <span className="ach-rays" />
                  {SPARKS.map((style, index) => (
                    <span key={index} className="ach-spark" style={style} />
                  ))}
                </span>
                <AchievementBadge achievement={singleDef} earned size={68} motion="assemble" />
              </div>
              <div className="ach-toast-text min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                  <span aria-hidden className="size-1.5 rotate-45 rounded-[1px] bg-[rgb(var(--ach-glow))] shadow-[0_0_6px_rgb(var(--ach-glow))]" />
                  {active.replay ? "Achievement replay" : `${BADGE_STYLES[singleDef.group].label} unlocked`}
                </p>
                <p className="mt-1 font-heading text-lg leading-tight font-bold text-balance">{singleDef.name}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{singleDef.description}</p>

                {active.coins > 0 || active.items.length > 0 ? (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-2">
                    {active.coins > 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold tabular-nums">
                        <Coins aria-hidden className="coin-ink size-4 shrink-0" />
                        <span className="coin-ink">+{active.coins.toLocaleString("en")} coins</span>
                      </span>
                    ) : null}
                    {active.items.map((itemId) => {
                      const info = rewardItemInfo(itemId);
                      const already = active.alreadyOwnedItems.includes(itemId);
                      return (
                        <span key={itemId} className="inline-flex min-w-0 items-center gap-2 text-xs">
                          <RewardItemVisual id={itemId} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-foreground">{info.name}</span>
                            <span className="block text-[10px] text-muted-foreground">
                              {rewardKindLabel(itemId)}
                              {already ? " · Already owned" : ""}
                            </span>
                          </span>
                        </span>
                      );
                    })}
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button asChild size="sm" variant="secondary" className="h-8">
                    <Link href={`/achievements#${singleDef.id}`} onClick={() => viewSingle(singleDef.id)}>
                      View achievement
                    </Link>
                  </Button>
                  {active.items[0] ? (
                    equippedIds.includes(active.items[0]) ? (
                      <span className="inline-flex h-8 items-center gap-1 px-2 text-xs font-semibold text-amethyst">
                        <Check aria-hidden className="size-3.5" />
                        Equipped
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={equipping !== null}
                        onClick={() => void equipReward(active.items[0])}
                      >
                        {equipping === active.items[0] ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : null}
                        Equip {rewardItemInfo(active.items[0]).name}
                      </Button>
                    )
                  ) : null}
                </div>
              </div>
            </div>
          ) : active.kind === "summary" ? (
            <div className="flex items-start gap-4 p-4 pr-11">
              <div className="relative mt-0.5 grid size-[72px] shrink-0 place-items-center">
                <AchievementBadge achievement={{ icon: "Medal", group: "Discovery" }} earned size={64} motion="assemble" />
              </div>
              <div className="ach-toast-text min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                  <span aria-hidden className="size-1.5 rotate-45 rounded-[1px] bg-[rgb(var(--ach-glow))] shadow-[0_0_6px_rgb(var(--ach-glow))]" />
                  Milestone rewards granted
                </p>
                <p className="mt-1 font-heading text-lg leading-tight font-bold text-balance">
                  {active.notices.length} earned achievements rewarded
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {active.notices
                    .slice(0, 3)
                    .map((n) => achievementDefinition(n.id)?.name ?? n.id)
                    .join(", ")}
                  {active.notices.length > 3 ? ` and ${active.notices.length - 3} more` : ""}
                </p>

                <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-2">
                  {active.totalCoins > 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold tabular-nums">
                      <Coins aria-hidden className="coin-ink size-4 shrink-0" />
                      <span className="coin-ink">+{active.totalCoins.toLocaleString("en")} coins</span>
                    </span>
                  ) : null}
                  {active.items.slice(0, 3).map((itemId) => (
                    <span key={itemId} className="inline-flex items-center gap-1.5 text-xs font-medium">
                      <RewardItemVisual id={itemId} size="sm" />
                      <span>{rewardItemInfo(itemId).name}</span>
                    </span>
                  ))}
                  {active.items.length > 3 ? (
                    <span className="text-xs text-muted-foreground">+{active.items.length - 3} more</span>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button asChild size="sm" variant="secondary" className="h-8">
                    <Link href="/achievements" onClick={dismiss}>
                      View cabinet
                    </Link>
                  </Button>
                  {active.items[0] ? (
                    <Button asChild size="sm" variant="outline" className="h-8">
                      <Link href={rewardCustomizeHref(active.items[0])} onClick={dismiss}>
                        Customize
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
          <Button type="button" variant="ghost" size="icon-sm" className="absolute top-2 right-2 size-7" aria-label="Dismiss achievement notification" title="Dismiss" onClick={dismiss}>
            <X aria-hidden className="size-4" />
          </Button>
        </aside>
      ) : null}
    </div>
  );
}
