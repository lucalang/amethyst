"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AchievementBadge, BADGE_STYLES, badgeVars } from "@/components/achievements/achievement-badge";
import { achievementDefinition, type AchievementNotice } from "@/lib/achievements";
import { apiFetch } from "@/lib/api-client";

type Celebration = AchievementNotice & { key: string; replay: boolean };

const SHOW_DELAY_MS = 700;
const VISIBLE_MS = 8000;
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

export function AchievementNotifications({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [queue, setQueue] = useState<Celebration[]>([]);
  const [safeToShow, setSafeToShow] = useState(false);
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const seen = useRef(new Set<string>());
  const active = queue[0];
  const definition = active ? achievementDefinition(active.id) : undefined;
  const allowed = Boolean(active && (enabled || active.replay));

  useEffect(() => {
    const receive = (event: Event) => {
      if (!enabled) return;
      const notices = (event as CustomEvent<AchievementNotice[]>).detail;
      if (!Array.isArray(notices)) return;
      const added = notices.filter((notice) => achievementDefinition(notice.id) && !seen.current.has(notice.id));
      for (const notice of added) seen.current.add(notice.id);
      if (added.length) setQueue((current) => [...current, ...added.map((notice) => ({ ...notice, key: `unlock:${notice.id}`, replay: false }))]);
    };
    const replay = (event: Event) => {
      const id = String((event as CustomEvent<string>).detail);
      if (!achievementDefinition(id)) return;
      setQueue((current) => [...current, { id, earnedAt: "", key: `replay:${id}:${Date.now()}`, replay: true }]);
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
        if (active && result.achievementReconciled) router.refresh();
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

  const visible = Boolean(active && definition && allowed && safeToShow && shownKey === active.key);
  useEffect(() => {
    if (!visible || paused) return;
    const timer = window.setTimeout(() => setQueue((current) => current.slice(1)), VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [visible, paused, activeKey]);

  function dismiss() {
    setPaused(false);
    setQueue((current) => current.slice(1));
  }

  function view() {
    if (active) window.dispatchEvent(new CustomEvent("archive:achievement-open", { detail: active.id }));
    dismiss();
  }

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[120] flex justify-end md:inset-x-auto md:right-6 md:bottom-6"
    >
      {visible && active && definition ? (
        <aside
          key={active.key}
          aria-label="Achievement unlocked"
          className="ach-toast pointer-events-auto w-full md:w-[26rem]"
          style={badgeVars(definition.group)}
          onPointerEnter={() => setPaused(true)}
          onPointerLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <div className="flex items-center gap-4 p-4 pr-11">
            <div className="relative grid size-[76px] shrink-0 place-items-center">
              <span aria-hidden className="ach-burst">
                <span className="ach-rays" />
                {SPARKS.map((style, index) => (
                  <span key={index} className="ach-spark" style={style} />
                ))}
              </span>
              <AchievementBadge achievement={definition} earned size={68} motion="assemble" />
            </div>
            <div className="ach-toast-text min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                <span aria-hidden className="size-1.5 rotate-45 rounded-[1px] bg-[rgb(var(--ach-glow))] shadow-[0_0_6px_rgb(var(--ach-glow))]" />
                {active.replay ? "Achievement replay" : "Achievement unlocked"}
              </p>
              <p className="mt-1 font-heading text-lg leading-tight font-bold text-balance">{definition.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{BADGE_STYLES[definition.group].label} achievement</p>
              <div className="mt-2.5">
                <Button asChild size="sm" variant="secondary" className="h-8">
                  <Link href={`/achievements#${definition.id}`} onClick={view}>
                    View achievement
                  </Link>
                </Button>
              </div>
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" className="absolute top-2 right-2 size-7" aria-label="Dismiss achievement notification" title="Dismiss" onClick={dismiss}>
            <X aria-hidden className="size-4" />
          </Button>
        </aside>
      ) : null}
    </div>
  );
}
