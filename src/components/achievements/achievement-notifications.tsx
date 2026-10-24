"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AchievementIcon } from "@/components/achievements/achievement-icon";
import { achievementDefinition, type AchievementNotice } from "@/lib/achievements";
import { apiFetch } from "@/lib/api-client";

export function AchievementNotifications({ enabled }: { enabled: boolean }) {
  const [queue, setQueue] = useState<AchievementNotice[]>([]);
  const [safeToShow, setSafeToShow] = useState(false);
  const [shownId, setShownId] = useState<string | null>(null);
  const seen = useRef(new Set<string>());
  const active = queue[0];
  const definition = active ? achievementDefinition(active.id) : undefined;

  useEffect(() => {
    const receive = (event: Event) => {
      if (!enabled) return;
      const notices = (event as CustomEvent<AchievementNotice[]>).detail;
      if (!Array.isArray(notices)) return;
      const added = notices.filter((notice) => achievementDefinition(notice.id) && !seen.current.has(notice.id));
      for (const notice of added) seen.current.add(notice.id);
      if (added.length) setQueue((current) => [...current, ...added]);
    };
    window.addEventListener("archive:achievement-unlocked", receive);
    return () => window.removeEventListener("archive:achievement-unlocked", receive);
  }, [enabled]);

  useEffect(() => {
    void apiFetch<{ achievementUnlocks: AchievementNotice[] }>("/api/achievements/notifications").catch(() => {});
  }, []);

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

  const activeId = active?.id;
  useEffect(() => {
    if (!activeId || !safeToShow || !enabled) return;
    const timer = window.setTimeout(() => setShownId(activeId), 700);
    return () => window.clearTimeout(timer);
  }, [activeId, enabled, safeToShow]);

  function dismiss() {
    setQueue((current) => current.slice(1));
  }

  if (!active || !definition || !enabled || !safeToShow || shownId !== active.id) return null;
  return (
    <aside aria-live="polite" aria-label="Achievement notification" className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[120] w-[min(24rem,calc(100vw-2rem))] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2">
      <div className="flex items-start gap-3 rounded-lg border border-amethyst/35 bg-background/95 p-3.5 shadow-[0_18px_48px_-20px_rgb(var(--shadow-rgb)/calc(0.9*var(--shadow-alpha)))] backdrop-blur-md">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-amethyst/10 text-amethyst">
          <AchievementIcon name={definition.icon} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-amethyst">Achievement unlocked</p>
          <p className="mt-0.5 truncate text-sm font-semibold">{definition.name}</p>
          <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{definition.description}</p>
          <Link href={`/achievements#${definition.id}`} onClick={dismiss} className="mt-2 inline-flex min-h-8 items-center text-xs font-semibold text-amethyst underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            View details
          </Link>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" className="size-7 shrink-0" aria-label="Dismiss achievement notification" title="Dismiss" onClick={dismiss}>
          <X aria-hidden className="size-4" />
        </Button>
      </div>
    </aside>
  );
}